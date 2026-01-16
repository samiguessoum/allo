const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/db');

const router = express.Router();

// Page de connexion
router.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/bde/dashboard');
    }
    res.render('auth/login', { error: null });
});

// Traitement connexion
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.render('auth/login', { error: 'Email ou mot de passe incorrect' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.render('auth/login', { error: 'Email ou mot de passe incorrect' });
        }

        // Créer la session
        req.session.userId = user.id;
        req.session.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            bdeListId: user.bde_list_id
        };

        res.redirect('/bde/dashboard');
    } catch (err) {
        console.error(err);
        res.render('auth/login', { error: 'Une erreur est survenue' });
    }
});

// Page d'inscription
router.get('/register', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/bde/dashboard');
    }
    // Récupérer les listes BDE disponibles
    const bdeLists = db.prepare('SELECT * FROM bde_lists').all();
    res.render('auth/register', { error: null, bdeLists });
});

// Traitement inscription
router.post('/register', async (req, res) => {
    const { email, password, confirmPassword, firstName, lastName, phone, bdeListId } = req.body;
    const bdeLists = db.prepare('SELECT * FROM bde_lists').all();

    // Validations
    if (!email || !password || !firstName || !lastName || !bdeListId) {
        return res.render('auth/register', {
            error: 'Tous les champs obligatoires doivent être remplis',
            bdeLists
        });
    }

    if (password !== confirmPassword) {
        return res.render('auth/register', {
            error: 'Les mots de passe ne correspondent pas',
            bdeLists
        });
    }

    if (password.length < 6) {
        return res.render('auth/register', {
            error: 'Le mot de passe doit contenir au moins 6 caractères',
            bdeLists
        });
    }

    try {
        // Vérifier si l'email existe déjà
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.render('auth/register', {
                error: 'Cet email est déjà utilisé',
                bdeLists
            });
        }

        // Hasher le mot de passe
        const passwordHash = await bcrypt.hash(password, 10);

        // Insérer l'utilisateur
        const result = db.prepare(`
            INSERT INTO users (email, password_hash, first_name, last_name, phone, bde_list_id, role)
            VALUES (?, ?, ?, ?, ?, ?, 'BDE_MEMBER')
        `).run(email, passwordHash, firstName, lastName, phone || null, bdeListId);

        // Créer la session
        req.session.userId = result.lastInsertRowid;
        req.session.user = {
            id: result.lastInsertRowid,
            email,
            firstName,
            lastName,
            role: 'BDE_MEMBER',
            bdeListId: parseInt(bdeListId)
        };

        res.redirect('/bde/dashboard');
    } catch (err) {
        console.error(err);
        res.render('auth/register', {
            error: 'Une erreur est survenue lors de l\'inscription',
            bdeLists
        });
    }
});

// Déconnexion
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;
