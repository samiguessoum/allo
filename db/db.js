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

    const slotsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='allo_slots'").get();
    if (slotsTableExists) {
        const slotsInfo = db.prepare("PRAGMA table_info(allo_slots)").all();
        const hasAddressColumn = slotsInfo.some(col => col.name === 'claimed_by_address');
        const hasCompletedColumn = slotsInfo.some(col => col.name === 'claimed_completed');

        if (!hasAddressColumn) {
            console.log('Migration: ajout de la colonne claimed_by_address...');
            db.exec("ALTER TABLE allo_slots ADD COLUMN claimed_by_address TEXT");
            console.log('Migration: colonne claimed_by_address ajoutee');
        }

        if (!hasCompletedColumn) {
            console.log('Migration: ajout de la colonne claimed_completed...');
            db.exec("ALTER TABLE allo_slots ADD COLUMN claimed_completed INTEGER DEFAULT 0");
            console.log('Migration: colonne claimed_completed ajoutee');
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
