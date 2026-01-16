const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Activer les foreign keys
db.pragma('foreign_keys = ON');

// Migrations pour mettre a jour la base existante
function runMigrations() {
    // Verifier si la table allos existe
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='allos'").get();

    if (tableExists) {
        // Verifier si la colonne theme existe
        const tableInfo = db.prepare("PRAGMA table_info(allos)").all();
        const hasThemeColumn = tableInfo.some(col => col.name === 'theme');

        if (!hasThemeColumn) {
            console.log('Migration: ajout de la colonne theme...');
            db.exec("ALTER TABLE allos ADD COLUMN theme TEXT DEFAULT 'Autres Allo'");
            console.log('Migration: colonne theme ajoutee');
        }
    }
}

// Initialiser la base de donnees avec le schema
function initDb() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('Base de donnees initialisee');
}

// Initialiser d'abord, puis executer les migrations
initDb();
runMigrations();

module.exports = db;
