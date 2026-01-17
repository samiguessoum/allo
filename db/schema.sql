-- Table listes BDE
CREATE TABLE IF NOT EXISTS bde_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    school TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table utilisateurs (BDE members + admins)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('BDE_MEMBER', 'ADMIN')) DEFAULT 'BDE_MEMBER',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    bde_list_id INTEGER REFERENCES bde_lists(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table ALLO
CREATE TABLE IF NOT EXISTS allos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bde_list_id INTEGER NOT NULL REFERENCES bde_lists(id),
    title TEXT NOT NULL,
    description TEXT,
    theme TEXT DEFAULT 'Autres Allo',
    conditions_text TEXT,
    status TEXT CHECK(status IN ('DRAFT', 'PUBLISHED', 'CLOSED')) DEFAULT 'DRAFT',
    opens_at DATETIME,
    closes_at DATETIME,
    created_by INTEGER NOT NULL REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME
);

-- Table slots
CREATE TABLE IF NOT EXISTS allo_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    allo_id INTEGER NOT NULL REFERENCES allos(id) ON DELETE CASCADE,
    claimed_by_name TEXT,
    claimed_by_phone TEXT,
    claimed_by_address TEXT,
    claimed_completed INTEGER DEFAULT 0,
    claimed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table etudiants (pour "Mes ALLO")
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requetes
CREATE INDEX IF NOT EXISTS idx_allos_status ON allos(status);
CREATE INDEX IF NOT EXISTS idx_allos_bde_list ON allos(bde_list_id);
CREATE INDEX IF NOT EXISTS idx_slots_allo ON allo_slots(allo_id);
CREATE INDEX IF NOT EXISTS idx_slots_phone ON allo_slots(claimed_by_phone);

-- Inserer une liste BDE par defaut
INSERT OR IGNORE INTO bde_lists (id, name, school) VALUES (1, 'Seker Story', 'IMT A');
