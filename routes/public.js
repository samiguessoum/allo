const express = require('express');
const db = require('../db/db');

const router = express.Router();

// Page d'accueil - Redirige vers /live
router.get('/', (req, res) => {
    res.redirect('/live');
});

// Page Live - Liste des ALLO publies
router.get('/live', (req, res) => {
    const now = new Date().toISOString();

    // Recuperer les ALLO publies avec leurs stats de slots
    const allos = db.prepare(`
        SELECT a.*,
               bl.name as bde_list_name,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id) as total_slots,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id AND claimed_by_phone IS NOT NULL) as claimed_slots
        FROM allos a
        LEFT JOIN bde_lists bl ON a.bde_list_id = bl.id
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE a.status = 'PUBLISHED'
        ORDER BY
            CASE WHEN (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id AND claimed_by_phone IS NULL) > 0 THEN 0 ELSE 1 END,
            a.published_at DESC
    `).all();

    // Ajouter des infos calculees pour chaque ALLO
    const allosWithStatus = allos.map(allo => {
        const availableSlots = allo.total_slots - allo.claimed_slots;
        let timeStatus = 'open';

        if (allo.opens_at && new Date(allo.opens_at) > new Date()) {
            timeStatus = 'not_yet';
        } else if (allo.closes_at && new Date(allo.closes_at) < new Date()) {
            timeStatus = 'closed';
        }

        return {
            ...allo,
            availableSlots,
            timeStatus
        };
    });

    res.render('public/live', { allos: allosWithStatus });
});

// Detail d'un ALLO
router.get('/allo/:id', (req, res) => {
    const alloId = req.params.id;

    const allo = db.prepare(`
        SELECT a.*,
               bl.name as bde_list_name,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               u.phone as creator_phone,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name,
               ua.phone as assigned_phone
        FROM allos a
        LEFT JOIN bde_lists bl ON a.bde_list_id = bl.id
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE a.id = ? AND a.status = 'PUBLISHED'
    `).get(alloId);

    if (!allo) {
        return res.status(404).render('public/error', {
            message: 'ALLO non trouve ou non disponible'
        });
    }

    // Recuperer les slots avec leur statut
    const slots = db.prepare(`
        SELECT id, claimed_by_phone IS NOT NULL as is_claimed, claimed_at
        FROM allo_slots
        WHERE allo_id = ?
        ORDER BY id
    `).all(alloId);

    // Calculer le statut temporel
    let timeStatus = 'open';
    let timeMessage = null;

    if (allo.opens_at && new Date(allo.opens_at) > new Date()) {
        timeStatus = 'not_yet';
        timeMessage = `Ouvre le ${new Date(allo.opens_at).toLocaleString('fr-FR')}`;
    } else if (allo.closes_at && new Date(allo.closes_at) < new Date()) {
        timeStatus = 'closed';
        timeMessage = 'Fermé';
    }

    const availableSlots = slots.filter(s => !s.is_claimed);

    res.render('public/allo', {
        allo,
        slots,
        availableSlots,
        timeStatus,
        timeMessage,
        success: req.query.success,
        error: req.query.error
    });
});

// SHOTGUN - Réserver un slot (POST avec JSON)
router.post('/shotgun/allo/:alloId', express.json(), (req, res) => {
    const alloId = req.params.alloId;
    const { firstName, lastName, phone, building, room } = req.body;

    // Validations
    if (!firstName || !lastName || !phone || !building || !room) {
        return res.status(400).json({
            success: false,
            message: 'Tous les champs sont obligatoires (prenom, nom, telephone, batiment, numero)'
        });
    }

    // Nettoyer le numero de telephone
    const cleanPhone = phone.replace(/\s/g, '');
    const cleanBuilding = building.trim();
    const cleanRoom = room.trim();
    const combinedAddress = `${cleanBuilding} ${cleanRoom}`.trim();

    // Verifier que l'ALLO existe et est publie
    const allo = db.prepare(`
        SELECT id, status, opens_at, closes_at
        FROM allos
        WHERE id = ?
    `).get(alloId);

    if (!allo) {
        return res.status(404).json({
            success: false,
            message: 'Allo\'s non trouve'
        });
    }

    if (allo.status !== 'PUBLISHED') {
        return res.status(400).json({
            success: false,
            message: 'Cet ALLO n\'est plus disponible'
        });
    }

    // Verifier la fenetre temporelle
    const now = new Date();
    if (allo.opens_at && new Date(allo.opens_at) > now) {
        return res.status(400).json({
            success: false,
            message: 'Cet ALLO n\'est pas encore ouvert'
        });
    }

    if (allo.closes_at && new Date(allo.closes_at) < now) {
        return res.status(400).json({
            success: false,
            message: 'Cet ALLO est Fermé'
        });
    }

    // Verifier si l'utilisateur a deja un slot sur cet ALLO
    const existingClaim = db.prepare(`
        SELECT id FROM allo_slots WHERE allo_id = ? AND claimed_by_phone = ?
    `).get(alloId, cleanPhone);

    if (existingClaim) {
        return res.status(400).json({
            success: false,
            message: 'Tu as deja reserve un slot sur cet ALLO !'
        });
    }

    // Verifier la limite de 4 shotguns max sur les ALLO publies
    const currentReservations = db.prepare(`
        SELECT COUNT(*) as count
        FROM allo_slots s
        JOIN allos a ON s.allo_id = a.id
        WHERE s.claimed_by_phone = ? AND a.status = 'PUBLISHED'
    `).get(cleanPhone);

    if (currentReservations.count >= 4) {
        return res.status(400).json({
            success: false,
            message: 'Tu as deja 4 reservations en cours ! Attends qu\'un Allo\'s soit termine pour en reserver un autre.'
        });
    }

    // SHOTGUN ATOMIQUE - UPDATE avec WHERE claimed_by_phone IS NULL
    const fullName = `${firstName} ${lastName}`;

    const result = db.prepare(`
        UPDATE allo_slots
        SET claimed_by_name = ?, claimed_by_phone = ?, claimed_by_address = ?, claimed_by_building = ?, claimed_by_room = ?, claimed_at = datetime('now')
        WHERE id = (
            SELECT id FROM allo_slots
            WHERE allo_id = ? AND claimed_by_phone IS NULL
            ORDER BY id
            LIMIT 1
        ) AND claimed_by_phone IS NULL
    `).run(fullName, cleanPhone, combinedAddress, cleanBuilding, cleanRoom, alloId);

    if (result.changes === 1) {
        // Succes ! Enregistrer/mettre a jour l'etudiant
        db.prepare(`
            INSERT INTO students (phone, first_name, last_name)
            VALUES (?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET first_name = ?, last_name = ?
        `).run(cleanPhone, firstName, lastName, firstName, lastName);

        return res.json({
            success: true,
            message: 'SHOTGUN ! Tu as reserve ce slot !'
        });
    } else {
        // Echec - quelqu'un d'autre a ete plus rapide
        return res.status(409).json({
            success: false,
            message: 'Trop tard ! Ce slot vient d\'etre pris par quelqu\'un d\'autre.'
        });
    }
});

// Mes ALLO (par numero de telephone)
router.get('/mes-allos', (req, res) => {
    res.render('public/mes-allos', { slots: null, phone: null });
});

router.post('/mes-allos', (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.render('public/mes-allos', {
            slots: null,
            phone: null,
            error: 'Veuillez entrer votre numero de telephone'
        });
    }

    const cleanPhone = phone.replace(/\s/g, '');

    // Recuperer les slots reserves par ce numero
    const slots = db.prepare(`
        SELECT s.*,
               a.title as allo_title,
               a.description as allo_description,
               a.conditions_text,
               a.theme,
               bl.name as bde_list_name,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               u.phone as creator_phone,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name,
               ua.phone as assigned_phone
        FROM allo_slots s
        JOIN allos a ON s.allo_id = a.id
        LEFT JOIN bde_lists bl ON a.bde_list_id = bl.id
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE s.claimed_by_phone = ?
        ORDER BY s.claimed_at DESC
    `).all(cleanPhone);

    res.render('public/mes-allos', { slots, phone: cleanPhone });
});

module.exports = router;
