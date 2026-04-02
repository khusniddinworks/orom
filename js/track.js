(function () {
  "use strict";

  var API = "";
  var STORAGE_KEY = "orom_aid";
  var SESSION_KEY = "orom_sid";

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getAnonymousId() {
    try {
      var id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (e) {
      return uuid();
    }
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = uuid();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      return uuid();
    }
  }

  function queryParams() {
    var q = {};
    location.search
      .slice(1)
      .split("&")
      .forEach(function (pair) {
        var p = pair.split("=");
        if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
    return q;
  }

  var qs = queryParams();

  window.OromTrack = {
    anonymousId: getAnonymousId(),
    sessionId: getSessionId(),
    scrollMax: 0,
    sessionStart: Date.now(),
    milestones: {},

    init: function () {
      this.flushSession();
      this.post("/api/session", {
        sessionId: this.sessionId,
        anonymousId: this.anonymousId,
        referrer: document.referrer || null,
        utm_source: qs.utm_source || null,
        utm_medium: qs.utm_medium || null,
        utm_campaign: qs.utm_campaign || null,
        utm_content: qs.utm_content || null,
        userAgent: navigator.userAgent,
        screenW: window.screen.width,
        screenH: window.screen.height,
        landingPath: location.pathname || "/",
      });
      this.event("pageview", "landing", { path: location.pathname });
    },

    flushSession: function () {
      var self = this;
      function sendEnd(abandoned, reason) {
        self.post("/api/session/end", {
          sessionId: self.sessionId,
          durationMs: Date.now() - self.sessionStart,
          scrollMaxPercent: self.scrollMax,
          abandoned: !!abandoned,
          reason: reason || null,
        });
      }
      window.addEventListener("pagehide", function () {
        sendEnd(false, "pagehide");
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          sendEnd(false, "hidden");
        }
      });
    },

    post: function (path, body) {
      var url = API + path;
      var data = JSON.stringify(body);
      if (navigator.sendBeacon) {
        try {
          navigator.sendBeacon(url, new Blob([data], { type: "application/json" }));
          return;
        } catch (e) {}
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
        keepalive: true,
      }).catch(function () {});
    },

    event: function (type, name, payload) {
      this.post("/api/event", {
        sessionId: this.sessionId,
        anonymousId: this.anonymousId,
        type,
        name: name || null,
        payload: payload || null,
        referrer: document.referrer || null,
        utm_source: qs.utm_source || null,
        utm_medium: qs.utm_medium || null,
        utm_campaign: qs.utm_campaign || null,
        utm_content: qs.utm_content || null,
        userAgent: navigator.userAgent,
        screenW: window.screen.width,
        screenH: window.screen.height,
        landingPath: location.pathname || "/",
      });
    },

    scrollDepth: function () {
      var doc = document.documentElement;
      var body = document.body;
      var h = Math.max(body.scrollHeight, doc.scrollHeight);
      var w = window.innerHeight;
      var top = window.scrollY || doc.scrollTop;
      if (h <= w) return 100;
      return Math.min(100, Math.round(((top + w) / h) * 100));
    },

    onScroll: function () {
      var p = this.scrollDepth();
      if (p > this.scrollMax) this.scrollMax = p;
      var self = this;
      [25, 50, 75, 100].forEach(function (m) {
        if (p >= m && !self.milestones[m]) {
          self.milestones[m] = true;
          self.event("scroll", "depth_" + m, { percent: m });
        }
      });
    },

    bindClicks: function () {
      document.addEventListener(
        "click",
        function (e) {
          var el = e.target.closest("[data-track]");
          if (!el) return;
          var name = el.getAttribute("data-track");
          var kind = el.getAttribute("data-track-type") || "click";
          if (kind === "cta") OromTrack.event("cta_click", name, { href: el.href || null });
          else OromTrack.event("click", name, { tag: el.tagName });
        },
        true
      );
    },
  };

  window.addEventListener("load", function () {
    OromTrack.init();
    OromTrack.bindClicks();
    var scrollT;
    window.addEventListener(
      "scroll",
      function () {
        clearTimeout(scrollT);
        scrollT = setTimeout(function () {
          OromTrack.onScroll();
        }, 120);
      },
      { passive: true }
    );
    OromTrack.onScroll();
  });
})();
