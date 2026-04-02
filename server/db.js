"use strict";

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

let db = null;

function persist(database) {
  const data = database.export();
  fs.writeFileSync(database.filePath, Buffer.from(data));
}

function wrapDatabase(rawDb, filePath) {
  rawDb.filePath = filePath;

  rawDb._save = function () {
    persist(this);
  };

  rawDb.runSave = function (sql, params) {
    this.run(sql, params || []);
    this._save();
  };

  rawDb.get = function (sql, params) {
    const stmt = this.prepare(sql);
    stmt.bind(params || []);
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  };

  rawDb.all = function (sql, params) {
    const stmt = this.prepare(sql);
    stmt.bind(params || []);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  };

  return rawDb;
}

async function openDb(filePath) {
  const SQL = await initSqlJs();
  let rawDb;
  if (fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath);
    rawDb = new SQL.Database(buf);
  } else {
    rawDb = new SQL.Database();
  }
  return wrapDatabase(rawDb, filePath);
}

function initSchema(database) {
  database.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  anonymous_id TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  user_agent TEXT,
  screen_w INTEGER,
  screen_h INTEGER,
  landing_path TEXT,
  exit_reason TEXT,
  scroll_max_percent INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  abandoned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  name TEXT,
  phone TEXT NOT NULL,
  telegram TEXT,
  instagram_dm INTEGER DEFAULT 0,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
`);
  database._save();
}


async function getDb(dbPath) {
  if (db) return db;
  const database = await openDb(dbPath);
  initSchema(database);
  db = database;
  return db;
}

module.exports = { getDb };
