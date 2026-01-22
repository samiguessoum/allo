const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Appliquer l'auth a toutes les routes BDE
router.use(requireAuth);

// Dashboard - Liste de mes ALLO
router.get('/dashboard', (req, res) => {
    const userId = req.session.userId;
    const bdeListId = req.session.user.bdeListId;

    // Recuperer mes ALLO (Créés par moi)
    const myAllos = db.prepare(`
        SELECT a.*,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id) as total_slots,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id AND claimed_by_phone IS NOT NULL) as claimed_slots
        FROM allos a
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE a.created_by = ?
        ORDER BY a.created_at DESC
    `).all(userId);

    // Recuperer tous les ALLO de ma liste BDE
    const allBdeAllos = db.prepare(`
        SELECT a.*,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id) as total_slots,
               (SELECT COUNT(*) FROM allo_slots WHERE allo_id = a.id AND claimed_by_phone IS NOT NULL) as claimed_slots
        FROM allos a
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE a.bde_list_id = ?
        ORDER BY a.created_at DESC
    `).all(bdeListId);

    res.render('bde/dashboard', { myAllos, allBdeAllos });
});

// Page creation ALLO
router.get('/allo/new', (req, res) => {
    res.render('bde/allo-form', { allo: null, error: null });
});

// Creation ALLO
router.post('/allo/new', (req, res) => {
    const { title, description, conditions, theme, nbSlots, opensAt, closesAt } = req.body;
    const userId = req.session.userId;
    const bdeListId = req.session.user.bdeListId;

    if (!title || !nbSlots) {
        return res.render('bde/allo-form', {
            allo: req.body,
            error: 'Le titre et le nombre de slots sont obligatoires'
        });
    }

    const slots = parseInt(nbSlots);
    if (isNaN(slots) || slots < 1) {
        return res.render('bde/allo-form', {
            allo: req.body,
            error: 'Le nombre de slots doit etre superieur ou egal a 1'
        });
    }

    // Valider le theme
    const validThemes = ['Allo Nourriture', 'Allo Pôle', 'Allo Transport', 'Allo Fun', 'Allo Démoniaque', 'Autres Allo'];
    const selectedTheme = validThemes.includes(theme) ? theme : 'Autres Allo';

    try {
        // Inserer l'ALLO
        const result = db.prepare(`
            INSERT INTO allos (bde_list_id, title, description, conditions_text, theme, opens_at, closes_at, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')
        `).run(
            bdeListId,
            title,
            description || null,
            conditions || null,
            selectedTheme,
            opensAt || null,
            closesAt || null,
            userId
        );

        const alloId = result.lastInsertRowid;

        // Créer les slots
        const insertSlot = db.prepare('INSERT INTO allo_slots (allo_id) VALUES (?)');
        for (let i = 0; i < slots; i++) {
            insertSlot.run(alloId);
        }

        res.redirect(`/bde/allo/${alloId}`);
    } catch (err) {
        console.error(err);
        res.render('bde/allo-form', {
            allo: req.body,
            error: 'Une erreur est survenue lors de la creation'
        });
    }
});

// Page edition ALLO
router.get('/allo/:id/edit', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo) {
        return res.status(404).send('ALLO non trouve');
    }

    // Verifier que c'est bien le createur
    if (allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    // Compter les slots
    const slotsCount = db.prepare('SELECT COUNT(*) as count FROM allo_slots WHERE allo_id = ?').get(alloId);

    res.render('bde/allo-form', {
        allo: { ...allo, nbSlots: slotsCount.count },
        error: null
    });
});

// Mise a jour ALLO
router.post('/allo/:id/edit', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;
    const { title, description, conditions, theme, opensAt, closesAt } = req.body;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    // Valider le theme
    const validThemes = ['Allo Nourriture', 'Allo Pôle', 'Allo Transport', 'Allo Fun', 'Allo Démoniaque', 'Autres Allo'];
    const selectedTheme = validThemes.includes(theme) ? theme : 'Autres Allo';

    try {
        db.prepare(`
            UPDATE allos
            SET title = ?, description = ?, conditions_text = ?, theme = ?, opens_at = ?, closes_at = ?
            WHERE id = ?
        `).run(title, description || null, conditions || null, selectedTheme, opensAt || null, closesAt || null, alloId);

        res.redirect(`/bde/allo/${alloId}`);
    } catch (err) {
        console.error(err);
        res.render('bde/allo-form', {
            allo: { ...allo, ...req.body },
            error: 'Une erreur est survenue'
        });
    }
});

// Detail ALLO (avec reservations)
router.get('/allo/:id', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;
    const bdeListId = req.session.user.bdeListId;

    const allo = db.prepare(`
        SELECT a.*,
               u.first_name as creator_first_name,
               u.last_name as creator_last_name,
               ua.first_name as assigned_first_name,
               ua.last_name as assigned_last_name
        FROM allos a
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users ua ON a.assigned_to = ua.id
        WHERE a.id = ?
    `).get(alloId);

    if (!allo) {
        return res.status(404).send('ALLO non trouve');
    }

    // Verifier que l'ALLO appartient a ma liste BDE
    if (allo.bde_list_id !== bdeListId) {
        return res.status(403).send('Acces non autorise');
    }

    // Recuperer les slots
    const slots = db.prepare(`
        SELECT * FROM allo_slots WHERE allo_id = ? ORDER BY id
    `).all(alloId);

    // Recuperer les membres BDE pour l'assignation
    const bdeMembers = db.prepare(`
        SELECT id, first_name, last_name FROM users WHERE bde_list_id = ?
    `).all(bdeListId);

    const isOwner = allo.created_by === userId;

    res.render('bde/allo-detail', { allo, slots, bdeMembers, isOwner });
});

// Publier un ALLO
router.post('/allo/:id/publish', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    db.prepare(`
        UPDATE allos SET status = 'PUBLISHED', published_at = datetime('now') WHERE id = ?
    `).run(alloId);

    if (allo.status === 'DRAFT' && allo.theme === 'Allo Nourriture') {
        const reservedByPhone = db.prepare(`
            SELECT id FROM allo_slots WHERE allo_id = ? AND claimed_by_phone = ?
        `).get(alloId, '0670191383');

        if (!reservedByPhone) {
            db.prepare(`
                UPDATE allo_slots
                SET claimed_by_name = ?, claimed_by_phone = ?, claimed_by_address = ?, claimed_by_building = ?, claimed_by_room = ?, delivery_status = 'todo', claimed_at = datetime('now')
                WHERE id = (
                    SELECT id FROM allo_slots
                    WHERE allo_id = ? AND claimed_by_phone IS NULL
                    ORDER BY id
                    LIMIT 1
                ) AND claimed_by_phone IS NULL
            `).run('Kalis Kraifi', '0670191383', 'i09 02', 'i09', '02', alloId);
        }
    }

    res.redirect('/bde/dashboard');
});

// Fermer un ALLO
router.post('/allo/:id/close', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    db.prepare(`
        UPDATE allos SET status = 'CLOSED' WHERE id = ?
    `).run(alloId);

    res.redirect(`/bde/allo/${alloId}`);
});

// Rouvrir un ALLO (remettre en PUBLISHED)
router.post('/allo/:id/reopen', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    db.prepare(`
        UPDATE allos SET status = 'PUBLISHED' WHERE id = ?
    `).run(alloId);

    res.redirect(`/bde/allo/${alloId}`);
});

// Assigner "Réalisé par"
router.post('/allo/:id/assign', (req, res) => {
    const alloId = req.params.id;
    const { assignedTo } = req.body;
    const bdeListId = req.session.user.bdeListId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.bde_list_id !== bdeListId) {
        return res.status(403).send('Acces non autorise');
    }

    // Verifier que l'utilisateur assigne est bien de la meme liste BDE
    if (assignedTo) {
        const assignee = db.prepare('SELECT * FROM users WHERE id = ? AND bde_list_id = ?').get(assignedTo, bdeListId);
        if (!assignee) {
            return res.status(400).send('Utilisateur invalide');
        }
    }

    db.prepare(`
        UPDATE allos SET assigned_to = ? WHERE id = ?
    `).run(assignedTo || null, alloId);

    res.redirect(`/bde/allo/${alloId}`);
});

// Supprimer un ALLO
router.post('/allo/:id/delete', (req, res) => {
    const alloId = req.params.id;
    const userId = req.session.userId;

    const allo = db.prepare('SELECT * FROM allos WHERE id = ?').get(alloId);

    if (!allo || allo.created_by !== userId) {
        return res.status(403).send('Acces non autorise');
    }

    // Supprimer les slots puis l'ALLO
    db.prepare('DELETE FROM allo_slots WHERE allo_id = ?').run(alloId);
    db.prepare('DELETE FROM allos WHERE id = ?').run(alloId);

    res.redirect('/bde/dashboard');
});

function updateDeliveryStatus(slotId, bdeListId, status, res) {
    const slot = db.prepare(`
        SELECT s.*, a.bde_list_id, a.id as allo_id
        FROM allo_slots s
        JOIN allos a ON s.allo_id = a.id
        WHERE s.id = ?
    `).get(slotId);

    if (!slot) {
        res.status(404).send('Slot non trouve');
        return;
    }

    if (slot.bde_list_id !== bdeListId) {
        res.status(403).send('Acces non autorise');
        return;
    }

    db.prepare(`
        UPDATE allo_slots
        SET delivery_status = ?
        WHERE id = ?
    `).run(status, slotId);

    res.redirect(`/bde/allo/${slot.allo_id}`);
}

router.post('/slot/:slotId/in-progress', (req, res) => {
    updateDeliveryStatus(req.params.slotId, req.session.user.bdeListId, 'in_progress', res);
});

router.post('/slot/:slotId/delivered', (req, res) => {
    updateDeliveryStatus(req.params.slotId, req.session.user.bdeListId, 'delivered', res);
});

router.post('/slot/:slotId/reset', (req, res) => {
    updateDeliveryStatus(req.params.slotId, req.session.user.bdeListId, 'todo', res);
});

// Compat: ancien bouton "Fait"
router.post('/slot/:slotId/complete', (req, res) => {
    updateDeliveryStatus(req.params.slotId, req.session.user.bdeListId, 'delivered', res);
});

router.post('/slot/:slotId/delete', (req, res) => {
    const slotId = req.params.slotId;
    const bdeListId = req.session.user.bdeListId;

    const slot = db.prepare(`
        SELECT s.*, a.bde_list_id, a.id as allo_id
        FROM allo_slots s
        JOIN allos a ON s.allo_id = a.id
        WHERE s.id = ?
    `).get(slotId);

    if (!slot) {
        return res.status(404).send('Slot non trouve');
    }

    if (slot.bde_list_id !== bdeListId) {
        return res.status(403).send('Acces non autorise');
    }

    db.prepare(`
        UPDATE allo_slots
        SET claimed_by_name = NULL,
            claimed_by_phone = NULL,
            claimed_by_address = NULL,
            claimed_by_building = NULL,
            claimed_by_room = NULL,
            delivery_status = 'todo',
            claimed_at = NULL
        WHERE id = ?
    `).run(slotId);

    if (req.get('X-Requested-With') === 'fetch') {
        return res.status(204).end();
    }

    res.redirect(`/bde/allo/${slot.allo_id}`);
});

module.exports = router;
