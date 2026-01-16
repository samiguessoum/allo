// Middleware pour vérifier si l'utilisateur est connecté (BDE)
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
}

// Middleware pour ajouter l'utilisateur aux locals (disponible dans les templates)
function addUserToLocals(req, res, next) {
    res.locals.user = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.userId;
    next();
}

module.exports = { requireAuth, addUserToLocals };
