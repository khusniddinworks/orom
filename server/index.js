"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { getDb } = require("./db");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "analytics.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function ensureSession(db, row) {
  const now = Date.now();
  const existing = db.get("SELECT id FROM sessions WHERE id = ?", [row.id]);
  if (!existing) {
    db.runSave(
      `INSERT INTO sessions (
        id, started_at, last_at, anonymous_id, referrer, utm_source, utm_medium,
        utm_campaign, utm_content, user_agent, screen_w, screen_h, landing_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        now,
        now,
        row.anonymous_id || null,
        row.referrer || null,
        row.utm_source || null,
        row.utm_medium || null,
        row.utm_campaign || null,
        row.utm_content || null,
        row.user_agent || null,
        row.screen_w ?? null,
        row.screen_h ?? null,
        row.landing_path || "/",
      ]
    );
  } else {
    db.runSave("UPDATE sessions SET last_at = ? WHERE id = ?", [now, row.id]);
  }
}

function attachRoutes(db) {
  app.post("/api/session", (req, res) => {
    try {
      const body = req.body || {};
      const id = String(body.sessionId || "").slice(0, 64);
      if (!id) return res.status(400).json({ error: "sessionId required" });
      ensureSession(db, {
        id,
        anonymous_id: body.anonymousId,
        referrer: body.referrer,
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_content: body.utm_content,
        user_agent: body.userAgent,
        screen_w: body.screenW,
        screen_h: body.screenH,
        landing_path: body.landingPath || "/",
      });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/event", (req, res) => {
    try {
      const body = req.body || {};
      const sessionId = String(body.sessionId || "").slice(0, 64);
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });

      ensureSession(db, {
        id: sessionId,
        anonymous_id: body.anonymousId,
        referrer: body.referrer,
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_content: body.utm_content,
        user_agent: body.userAgent,
        screen_w: body.screenW,
        screen_h: body.screenH,
        landing_path: body.landingPath,
      });

      const type = String(body.type || "custom").slice(0, 64);
      const name = body.name != null ? String(body.name).slice(0, 128) : null;
      const payload =
        body.payload != null ? JSON.stringify(body.payload).slice(0, 8000) : null;

      db.runSave(
        `INSERT INTO events (session_id, type, name, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
        [sessionId, type, name, payload, Date.now()]
      );

      if (type === "scroll" && body.payload && typeof body.payload.percent === "number") {
        const pct = Math.min(100, Math.max(0, Math.round(body.payload.percent)));
        db.runSave(
          `UPDATE sessions SET scroll_max_percent = MAX(scroll_max_percent, ?), last_at = ? WHERE id = ?`,
          [pct, Date.now(), sessionId]
        );
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/session/end", (req, res) => {
    try {
      const body = req.body || {};
      const sessionId = String(body.sessionId || "").slice(0, 64);
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });

      const duration = Math.max(0, Math.min(86400000, Number(body.durationMs) || 0));
      const scrollMax = Math.min(100, Math.max(0, Number(body.scrollMaxPercent) || 0));
      const abandoned = body.abandoned ? 1 : 0;
      const reason = body.reason ? String(body.reason).slice(0, 64) : null;

      db.runSave(
        `UPDATE sessions SET duration_ms = ?, scroll_max_percent = MAX(scroll_max_percent, ?),
         last_at = ?, exit_reason = ?, abandoned = ? WHERE id = ?`,
        [duration, scrollMax, Date.now(), reason, abandoned, sessionId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/lead", (req, res) => {
    try {
      const body = req.body || {};
      const phone = String(body.phone || "").replace(/\s/g, "").slice(0, 32);
      if (!phone) return res.status(400).json({ error: "phone required" });

      const sessionId = body.sessionId ? String(body.sessionId).slice(0, 64) : null;
      if (sessionId) {
        ensureSession(db, {
          id: sessionId,
          anonymous_id: body.anonymousId,
          referrer: body.referrer,
          utm_source: body.utm_source,
          utm_medium: body.utm_medium,
          utm_campaign: body.utm_campaign,
          utm_content: body.utm_content,
        });
      }

      const name = body.name != null ? String(body.name).slice(0, 120) : null;
      const telegram =
        body.telegram != null
          ? String(body.telegram).replace(/^@/, "").slice(0, 64)
          : null;
      const instagramDm = body.instagram_dm ? 1 : 0;

      db.runSave(
        `INSERT INTO leads (session_id, name, phone, telegram, instagram_dm, referrer, utm_source, utm_medium, utm_campaign, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          name,
          phone,
          telegram,
          instagramDm,
          body.referrer || null,
          body.utm_source || null,
          body.utm_medium || null,
          body.utm_campaign || null,
          Date.now(),
        ]
      );

      const leadRow = db.get("SELECT last_insert_rowid() AS id");
      const leadId = leadRow && leadRow.id != null ? leadRow.id : null;
      if (sessionId && leadId != null) {
        db.runSave(
          `INSERT INTO events (session_id, type, name, payload, created_at) VALUES (?, 'lead_submit', 'lead_form', ?, ?)`,
          [sessionId, JSON.stringify({ leadId }), Date.now()]
        );
      }

      res.json({ ok: true, id: leadId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/admin/summary", requireAdmin, (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days || "30", 10)));
      const since = Date.now() - days * 86400000;

      const totalSessions = db.get(
        `SELECT COUNT(*) AS c FROM sessions WHERE started_at >= ?`,
        [since]
      ).c;

      const uniqueVisitors = db.get(
        `SELECT COUNT(DISTINCT COALESCE(anonymous_id, id)) AS c FROM sessions WHERE started_at >= ?`,
        [since]
      ).c;

      const leadsCount = db.get(
        `SELECT COUNT(*) AS c FROM leads WHERE created_at >= ?`,
        [since]
      ).c;

      const pageviews = db.get(
        `SELECT COUNT(*) AS c FROM events WHERE type = 'pageview' AND created_at >= ?`,
        [since]
      ).c;

      const ctaClicks = db.get(
        `SELECT COUNT(*) AS c FROM events WHERE type = 'cta_click' AND created_at >= ?`,
        [since]
      ).c;

      const conversionRate =
        totalSessions > 0 ? Number(((leadsCount / totalSessions) * 100).toFixed(2)) : 0;

      const avgScrollRow = db.get(
        `SELECT AVG(scroll_max_percent) AS v FROM sessions WHERE started_at >= ?`,
        [since]
      );
      const avgScroll = avgScrollRow && avgScrollRow.v != null ? avgScrollRow.v : 0;

      const avgDurRow = db.get(
        `SELECT AVG(duration_ms) AS v FROM sessions WHERE started_at >= ? AND duration_ms > 0`,
        [since]
      );
      const avgDuration = avgDurRow && avgDurRow.v != null ? avgDurRow.v : 0;

      const topSources = db.all(
        `SELECT COALESCE(utm_source, '(direct)') AS src, COUNT(*) AS c
         FROM sessions WHERE started_at >= ? GROUP BY src ORDER BY c DESC LIMIT 8`,
        [since]
      );

      const topCtas = db.all(
        `SELECT name, COUNT(*) AS c FROM events WHERE type = 'cta_click' AND created_at >= ?
         GROUP BY name ORDER BY c DESC LIMIT 10`,
        [since]
      );

      const topClicks = db.all(
        `SELECT name, COUNT(*) AS c FROM events WHERE type = 'click' AND created_at >= ? AND name IS NOT NULL
         GROUP BY name ORDER BY c DESC LIMIT 12`,
        [since]
      );

      const dropoffs = db.get(
        `SELECT
          COALESCE(SUM(CASE WHEN scroll_max_percent < 25 THEN 1 ELSE 0 END), 0) AS b0_25,
          COALESCE(SUM(CASE WHEN scroll_max_percent >= 25 AND scroll_max_percent < 50 THEN 1 ELSE 0 END), 0) AS b25_50,
          COALESCE(SUM(CASE WHEN scroll_max_percent >= 50 AND scroll_max_percent < 75 THEN 1 ELSE 0 END), 0) AS b50_75,
          COALESCE(SUM(CASE WHEN scroll_max_percent >= 75 THEN 1 ELSE 0 END), 0) AS b75_100
         FROM sessions WHERE started_at >= ?`,
        [since]
      );

      const popupOpens = db.get(
        `SELECT COUNT(*) AS c FROM events WHERE type = 'popup' AND name = 'open' AND created_at >= ?`,
        [since]
      ).c;

      const recentLeads = db.all(
        `SELECT id, name, phone, telegram, instagram_dm, utm_source, created_at FROM leads
         WHERE created_at >= ? ORDER BY created_at DESC LIMIT 50`,
        [since]
      );

      const dailyTraffic = db.all(
        `SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS d, COUNT(*) AS c
         FROM sessions WHERE started_at >= ? GROUP BY d ORDER BY d ASC`,
        [since]
      );

      res.json({
        periodDays: days,
        totalSessions,
        uniqueVisitors,
        leadsCount,
        pageviews,
        ctaClicks,
        conversionRate,
        avgScrollPercent: Math.round(avgScroll),
        avgDurationSec: Math.round(avgDuration / 1000),
        topSources,
        topCtas,
        topClicks,
        dropoffs,
        popupOpens,
        recentLeads,
        dailyTraffic,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/admin/export/leads.csv", requireAdmin, (req, res) => {
    try {
      const rows = db.all(
        `SELECT id, session_id, name, phone, telegram, instagram_dm, referrer, utm_source, utm_medium, utm_campaign, created_at FROM leads ORDER BY created_at DESC`
      );
      const header =
        "id,session_id,name,phone,telegram,instagram_dm,referrer,utm_source,utm_medium,utm_campaign,created_at_iso\n";
      const lines = rows.map((r) => {
        const iso = new Date(r.created_at).toISOString();
        return [
          r.id,
          r.session_id || "",
          csvEscape(r.name),
          csvEscape(r.phone),
          csvEscape(r.telegram),
          r.instagram_dm,
          csvEscape(r.referrer),
          csvEscape(r.utm_source),
          csvEscape(r.utm_medium),
          csvEscape(r.utm_campaign),
          iso,
        ].join(",");
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send("\ufeff" + header + lines.join("\n"));
    } catch (e) {
      console.error(e);
      res.status(500).send("Error");
    }
  });
}

function csvEscape(s) {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const PORT = process.env.PORT || 3000;

(async () => {
  const db = await getDb(DB_PATH);
  attachRoutes(db);

  app.get("/admin/", (req, res) => {
    res.sendFile(path.join(ROOT, "public", "admin", "index.html"));
  });
  app.get("/admin", (req, res) => res.redirect(301, "/admin/"));
  app.use("/assets", express.static(path.join(ROOT, "assets")));
  app.use("/video", express.static(path.join(ROOT, "video")));
  app.use(express.static(path.join(ROOT, "public")));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.join(ROOT, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Orom Yo‘stiq server http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin/`);
    console.log(`ADMIN_SECRET: ${ADMIN_SECRET === "change-me-in-production" ? "(default — o‘zgartiring!)" : "(o‘rnatilgan)"}`);
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
