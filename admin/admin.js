(function () {
  "use strict";

  var STORAGE = "orom_admin_key";
  var chTraffic, chDrop, chCta, chSrc;

  function $(id) {
    return document.getElementById(id);
  }

  function getKey() {
    try {
      return sessionStorage.getItem(STORAGE) || localStorage.getItem(STORAGE) || "";
    } catch (e) {
      return "";
    }
  }

  function setKey(k) {
    try {
      sessionStorage.setItem(STORAGE, k);
      localStorage.setItem(STORAGE, k);
    } catch (e) {}
  }

  function showErr(el, msg) {
    if (!el) return;
    el.style.display = msg ? "block" : "none";
    el.textContent = msg || "";
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    return d.toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" });
  }

  function fetchSummary(days, key) {
    return fetch("/api/admin/summary?days=" + encodeURIComponent(days), {
      headers: { "X-Admin-Key": key },
    }).then(function (r) {
      if (r.status === 401) throw new Error("Noto‘g‘ri kalit");
      if (!r.ok) throw new Error("Server xatosi");
      return r.json();
    });
  }

  function renderKpis(data) {
    var el = $("kpis");
    var items = [
      { label: "Sessiyalar", val: data.totalSessions },
      { label: "Unikal tashrif", val: data.uniqueVisitors },
      { label: "Lidlar", val: data.leadsCount },
      { label: "Konversiya %", val: data.conversionRate },
      { label: "CTA bosish", val: data.ctaClicks },
      { label: "O‘rtacha scroll %", val: data.avgScrollPercent },
      { label: "O‘rtacha vaqt (s)", val: data.avgDurationSec },
      { label: "Popup ochilish", val: data.popupOpens },
    ];
    el.innerHTML = items
      .map(function (x) {
        return (
          '<div class="card"><strong>' +
          x.val +
          '</strong><span>' +
          x.label +
          "</span></div>"
        );
      })
      .join("");
  }

  function renderTableBody(id, rows, fn) {
    var tb = $(id);
    tb.innerHTML = rows.map(fn).join("");
  }

  function destroyCharts() {
    [chTraffic, chDrop, chCta, chSrc].forEach(function (c) {
      if (c) c.destroy();
    });
    chTraffic = chDrop = chCta = chSrc = null;
  }

  function renderCharts(data) {
    destroyCharts();
    var soft = "rgba(125, 106, 168, 0.75)";
    var deep = "rgba(90, 72, 120, 0.9)";

    var labelsT = (data.dailyTraffic || []).map(function (x) {
      return x.d;
    });
    var valsT = (data.dailyTraffic || []).map(function (x) {
      return x.c;
    });
    chTraffic = new Chart(document.getElementById("ch-traffic"), {
      type: "line",
      data: {
        labels: labelsT,
        datasets: [
          {
            label: "Sessiya",
            data: valsT,
            borderColor: deep,
            backgroundColor: soft,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });

    var d = data.dropoffs || {};
    chDrop = new Chart(document.getElementById("ch-drop"), {
      type: "bar",
      data: {
        labels: ["0–25%", "25–50%", "50–75%", "75–100%"],
        datasets: [
          {
            label: "Sessiya",
            data: [d.b0_25 || 0, d.b25_50 || 0, d.b50_75 || 0, d.b75_100 || 0],
            backgroundColor: [soft, soft, deep, deep],
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });

    var ctas = data.topCtas || [];
    chCta = new Chart(document.getElementById("ch-cta"), {
      type: "bar",
      data: {
        labels: ctas.map(function (x) {
          return x.name || "—";
        }),
        datasets: [
          {
            data: ctas.map(function (x) {
              return x.c;
            }),
            backgroundColor: deep,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });

    var srcs = data.topSources || [];
    chSrc = new Chart(document.getElementById("ch-src"), {
      type: "doughnut",
      data: {
        labels: srcs.map(function (x) {
          return x.src;
        }),
        datasets: [
          {
            data: srcs.map(function (x) {
              return x.c;
            }),
            backgroundColor: [
              "#7d6aa8",
              "#9b8bc4",
              "#b8aad9",
              "#5a4878",
              "#c4a8e0",
              "#8b7ab8",
              "#6b5a94",
              "#a894c9",
            ],
          },
        ],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  function load() {
    var key = getKey();
    var days = $("days").value;
    showErr($("dash-err"), "");
    fetchSummary(days, key)
      .then(function (data) {
        renderKpis(data);
        renderCharts(data);
        renderTableBody("tbl-clicks", data.topClicks || [], function (row) {
          return (
            "<tr><td>" +
            (row.name || "") +
            "</td><td>" +
            row.c +
            "</td></tr>"
          );
        });
        renderTableBody("tbl-leads", data.recentLeads || [], function (row) {
          return (
            "<tr><td>" +
            fmtDate(row.created_at) +
            "</td><td>" +
            (row.phone || "") +
            "</td><td>" +
            (row.telegram || "—") +
            "</td><td>" +
            (row.utm_source || "—") +
            "</td></tr>"
          );
        });
        $("export-csv").href =
          "/api/admin/export/leads.csv?key=" + encodeURIComponent(key);
      })
      .catch(function (e) {
        showErr($("dash-err"), e.message || "Xato");
      });
  }

  function enterDash() {
    $("login").style.display = "none";
    $("dash").classList.remove("hidden");
    load();
  }

  $("login-btn").addEventListener("click", function () {
    var key = $("key").value.trim();
    if (!key) {
      showErr($("login-err"), "Kalit kiriting");
      return;
    }
    showErr($("login-err"), "");
    fetchSummary(7, key)
      .then(function () {
        setKey(key);
        enterDash();
      })
      .catch(function () {
        showErr($("login-err"), "Kalit noto‘g‘ri yoki server ishlamayapti.");
      });
  });

  $("refresh").addEventListener("click", load);
  $("days").addEventListener("change", load);

  if (getKey()) {
    fetchSummary(7, getKey())
      .then(enterDash)
      .catch(function () {
        try {
          sessionStorage.removeItem(STORAGE);
          localStorage.removeItem(STORAGE);
        } catch (e) {}
        $("login").style.display = "block";
      });
  }
})();
