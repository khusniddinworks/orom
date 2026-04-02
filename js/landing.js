(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* Scroll reveal */
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  qsa("[data-reveal]").forEach(function (el) {
    io.observe(el);
  });

  /* Self-identification checklist (teskari piramida — avvalo tanishuv) */
  qsa(".check-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.classList.toggle("is-checked");
      var id = btn.getAttribute("data-check-item") || "item";
      if (window.OromTrack) {
        OromTrack.event("checklist", id, {
          checked: btn.classList.contains("is-checked"),
        });
      }
    });
  });

  /* Review slider */
  var track = qs("[data-review-track]");
  var prevBtn = qs("[data-review-prev]");
  var nextBtn = qs("[data-review-next]");
  if (track && prevBtn && nextBtn) {
    var idx = 0;
    var slides = qsa(".review-card", track);
    function slideTo(i) {
      idx = (i + slides.length) % slides.length;
      track.style.transform = "translateX(-" + idx * 100 + "%)";
      if (window.OromTrack) {
        OromTrack.event("review_slide", "review_" + idx, { index: idx });
      }
    }
    prevBtn.addEventListener("click", function () {
      slideTo(idx - 1);
    });
    nextBtn.addEventListener("click", function () {
      slideTo(idx + 1);
    });
  }

  /* Live toasts (social proof) */
  var lang = document.documentElement.lang || "uz";
  var i18n = {
    uz: {
      cities: ["Toshkent", "Samarqand", "Farg‘ona", "Andijon", "Buxoro", "Namangan"],
      toast: "Yaqinda {city}dan buyurtma olindi"
    },
    ru: {
      cities: ["Ташкент", "Самарканд", "Фергана", "Андижан", "Бухара", "Наманган"],
      toast: "Недавно получен заказ из г. {city}"
    },
    en: {
      cities: ["Tashkent", "Samarkand", "Fergana", "Andijan", "Bukhara", "Namangan"],
      toast: "Recently received an order from {city}"
    }
  };

  var toastEl = qs("[data-live-toast]");
  var viewCountEl = qs("[data-live-views]");

  if (viewCountEl) {
    var base = 8 + Math.floor(Math.random() * 8);
    viewCountEl.textContent = String(base);
    setInterval(function () {
      var n = parseInt(viewCountEl.textContent, 10) || base;
      var delta = Math.random() > 0.5 ? 1 : 0;
      viewCountEl.textContent = String(n + delta);
    }, 45000);
  }

  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("toast--show");
    setTimeout(function () {
      toastEl.classList.remove("toast--show");
    }, 4200);
  }

  function randomPurchaseToast() {
    var current = i18n[lang] || i18n.uz;
    var city = current.cities[Math.floor(Math.random() * current.cities.length)];
    var msg = current.toast.replace("{city}", city);
    showToast(msg);
  }

  setTimeout(randomPurchaseToast, 8000);
  setInterval(function () {
    if (Math.random() > 0.35) randomPurchaseToast();
  }, 38000);

  /* Lead modal */
  var leadModal = qs("[data-lead-modal]");
  var leadCloseBtn = leadModal && leadModal.querySelector("[data-lead-close]");
  var leadOpeners = qsa("[data-lead-open]");
  var leadForm = qs("[data-lead-form]");
  var leadSticky = qs("[data-lead-sticky]");

  function openLead(source) {
    if (!leadModal) return;
    leadModal.hidden = false;
    document.body.style.overflow = "hidden";
    if (window.OromTrack) {
      OromTrack.event("popup", "open", { source: source || "unknown" });
      OromTrack.event("form", "lead_open", {});
    }
  }

  function closeLead() {
    if (!leadModal) return;
    leadModal.hidden = true;
    document.body.style.overflow = "";
    if (window.OromTrack) OromTrack.event("popup", "close", {});
  }

  leadOpeners.forEach(function (btn) {
    btn.addEventListener("click", function () {
      openLead(btn.getAttribute("data-lead-open"));
    });
  });

  if (leadModal) {
    leadModal.addEventListener("click", function (e) {
      if (e.target === leadModal) closeLead();
    });
  }
  if (leadCloseBtn) {
    leadCloseBtn.addEventListener("click", function () {
      closeLead();
    });
  }

  /* Soft timing popup */
  setTimeout(function () {
    try {
      if (sessionStorage.getItem("orom_lead_shown")) return;
      openLead("timer");
      sessionStorage.setItem("orom_lead_shown", "1");
    } catch (e) {
      openLead("timer");
    }
  }, 22000);

  if (leadForm) {
    leadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(leadForm);
      var name = (fd.get("name") || "").toString().trim();
      var phone = (fd.get("phone") || "").toString().trim();
      var telegram = (fd.get("telegram") || "").toString().trim();
      var ig = fd.get("instagram_dm");
      var qs = {};
      location.search
        .slice(1)
        .split("&")
        .forEach(function (pair) {
          var p = pair.split("=");
          if (p[0]) qs[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
        });

      if (!phone) return;

      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: window.OromTrack && OromTrack.sessionId,
          anonymousId: window.OromTrack && OromTrack.anonymousId,
          name: name || null,
          phone: phone,
          telegram: telegram || null,
          instagram_dm: !!ig,
          referrer: document.referrer || null,
          utm_source: qs.utm_source || null,
          utm_medium: qs.utm_medium || null,
          utm_campaign: qs.utm_campaign || null,
        }),
      })
        .then(function (r) {
          var ok = r.ok;
          return r.text().then(function (text) {
            var body = {};
            if (text) {
              try {
                body = JSON.parse(text);
              } catch (err) {
                body = {};
              }
            }
            return { ok: ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var errMsg =
              result.body && result.body.error
                ? String(result.body.error)
                : "Yuborishda xatolik. Qayta urinib ko‘ring.";
            showToast(errMsg);
            return;
          }
          if (window.OromTrack) OromTrack.event("form", "lead_submit_ok", {});
          closeLead();
          leadForm.reset();
          showToast("Rahmat! Tez orada siz bilan bog‘lanamiz.");
        })
        .catch(function () {
          showToast("Internetni tekshiring va qayta urinib ko‘ring.");
        });
    });

    leadForm.addEventListener(
      "focusin",
      function () {
        if (window.OromTrack) OromTrack.event("form", "lead_focus", {});
      },
      true
    );
  }

  /* Sticky CTA visibility */
  var hero = qs(".hero");
  if (leadSticky && hero) {
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          leadSticky.classList.toggle("sticky-cta--hidden", en.isIntersecting);
        });
      },
      { threshold: 0.15 }
    );
    obs.observe(hero);
  }
})();
