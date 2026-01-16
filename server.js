const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(session({
    secret: process.env.SESSION_SECRET || 'allo-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
}));

// Middleware pour ajouter l'utilisateur aux templates
const { addUserToLocals } = require('./middleware/auth');
app.use(addUserToLocals);

// Routes
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const bdeRoutes = require('./routes/bde');

app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/bde', bdeRoutes);

// Page d'erreur 404
app.use((req, res) => {
    res.status(404).render('public/error', {
        message: 'Page non trouvée'
    });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('public/error', {
        message: 'Une erreur est survenue'
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║          ALLO - Shotgun BDE               ║
║                                           ║
║   Serveur démarré sur le port ${PORT}         ║
║   http://localhost:${PORT}                    ║
╚═══════════════════════════════════════════╝
    `);
});
