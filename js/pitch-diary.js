(function () {
  // localStorage key this whole diary is saved under, on this device.
  var STORAGE_KEY = "maple-pitch-diary";
  // localStorage flag remembering whether this device has unlocked editing before.
  var EDIT_STORAGE_KEY = "tracker_edit_unlocked";
  // SHA-256 hash of the edit password — the plain text is never stored anywhere.
  var EDIT_PASSWORD_HASH = "9e68ae360e4f5833da1cb93ab5b96f76e79e696ee7b5c6409d6db865d3a273ae";
  var DAY_MS = 86400000;

  // ---- cloud sync (Supabase) ----
  // Same project as the menu planner, separate table. Reads are always
  // open (so a locked/view-only visit still shows the latest data); writes
  // reuse the existing edit-lock — there's no separate sync password.
  var SUPABASE_URL = "https://jhmctzavhpprbokdlbwe.supabase.co";
  var SUPABASE_KEY = "sb_publishable_0NQ1jx8nVQdTlREiNCkTiw_MJfZTLyU";
  var SUPABASE_TABLE = "pitch_diary_state";
  var SUPABASE_ROW_ID = "default";

  // Hashes a string with SHA-256 and returns the lowercase hex digest,
  // used to check the typed password against EDIT_PASSWORD_HASH without
  // ever comparing/storing the plain text.
  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  // Starting set of tracked bosses/items, used only the very first time this
  // page ever loads on a device with no saved state and no cloud data yet.
  var defaultItems = [
    { boss: "Lotus", item: "Berserked", kills: 111, drops: 4, received: 4, lastDrop: "2026-07-16", cadence: "weekly" },
    { boss: "Lotus", item: "Total Control", kills: 71, drops: 2, received: 1, lastDrop: "2025-07-31", cadence: "weekly" },
    { boss: "Baldrix", item: "Pendant", kills: 0, drops: 0, received: 0, lastDrop: null, cadence: "weekly" },
    { boss: "Damien", item: "Eyepatch", kills: 112, drops: 4, received: 4, lastDrop: "2026-05-14", cadence: "weekly" },
    { boss: "Lucid", item: "Dreamy Belt", kills: 115, drops: 3, received: 2, lastDrop: "2025-07-04", cadence: "weekly" },
    { boss: "Will", item: "Book", kills: 113, drops: 1, received: 1, lastDrop: "2025-04-17", cadence: "weekly" },
    { boss: "Gloom", item: "ET", kills: 111, drops: 2, received: 2, lastDrop: "2026-07-09", cadence: "weekly" },
    { boss: "Darknell", item: "CFE", kills: 113, drops: 5, received: 5, lastDrop: "2026-06-04", cadence: "weekly" },
    { boss: "Hilla", item: "Source", kills: 111, drops: 3, received: 3, lastDrop: "2025-10-23", cadence: "weekly" },
    { boss: "Black Mage", item: "Gene", kills: 26, drops: 1, received: 1, lastDrop: "2026-08-01", cadence: "monthly" },
    { boss: "Seren", item: "Mitra", kills: 103, drops: 8, received: 1, lastDrop: "2024-10-18", cadence: "weekly" },
    { boss: "Limbo", item: "Ring", kills: 33, drops: 0, received: 0, lastDrop: null, cadence: "weekly" },
    { boss: "First Adv", item: "Medal", kills: 30, drops: 0, received: 0, lastDrop: null, cadence: "weekly" }
  ];

  // Short unique-enough id for items/log entries — good enough for a
  // single-user client-side app, not meant to be globally unique.
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Builds a brand-new state object from defaultItems, each with a fresh id.
  function seedState() {
    return {
      items: defaultItems.map(function (it) {
        return {
          id: makeId(),
          boss: it.boss,
          item: it.item,
          kills: it.kills,
          drops: it.drops,
          received: it.received,
          lastDrop: it.lastDrop,
          cadence: it.cadence
        };
      }),
      entries: [],
      autoLastRun: todayIso()
    };
  }

  // Fills in/repairs fields on state loaded from localStorage or Supabase,
  // so older saved data (from before a field existed) doesn't break the app.
  function normalizeState(raw) {
    raw.items.forEach(function (it) {
      if (it.cadence !== "weekly" && it.cadence !== "monthly") it.cadence = "weekly";
    });
    if (typeof raw.autoLastRun !== "string") raw.autoLastRun = todayIso();
    return raw;
  }

  // Reads whatever's saved on this device, falling back to a fresh seeded
  // state if nothing's there yet or it doesn't look like valid diary data.
  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && Array.isArray(raw.items) && Array.isArray(raw.entries)) return normalizeState(raw);
    } catch (e) {}
    return seedState();
  }

  // Persists the current state locally and, if editing is unlocked,
  // schedules a push of the same data up to Supabase.
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleRemotePush();
  }

  var state = loadState();

  // ---- helpers ----
  // Case-insensitive, whitespace-trimmed key used to match a boss+item pair
  // against an existing tracked item, regardless of how it was typed.
  function itemKey(boss, item) {
    return (boss || "").trim().toLowerCase() + "|" + (item || "").trim().toLowerCase();
  }

  // Finds an already-tracked item by boss+item name, or null if none matches.
  function findItem(boss, item) {
    var key = itemKey(boss, item);
    for (var i = 0; i < state.items.length; i++) {
      if (itemKey(state.items[i].boss, state.items[i].item) === key) return state.items[i];
    }
    return null;
  }

  // Formats an ISO "YYYY-MM-DD" date as "DD-MM-YYYY" for display; "—" if empty.
  function formatDate(iso) {
    if (!iso) return "—";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "-" + parts[1] + "-" + parts[0];
  }

  // Today's date as an ISO "YYYY-MM-DD" string, in the browser's local time.
  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // Returns every Thursday strictly after lastIso up to and including
  // todayStr, as Date objects — used to figure out how many weekly resets
  // have passed since the app last applied auto-kills.
  function thursdaysSince(lastIso, todayStr) {
    var cursor = new Date(lastIso + "T00:00:00");
    cursor.setDate(cursor.getDate() + 1);
    var today = new Date(todayStr + "T00:00:00");
    var diff = (4 - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    var out = [];
    while (cursor <= today) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }

  // True if the given date falls within the first 7 days of its month —
  // used to identify the monthly reset Thursday for "monthly" cadence items.
  function isFirstThursdayOfMonth(d) { return d.getDate() <= 7; }

  // Bumps kill counts for every Thursday reset that's passed since
  // state.autoLastRun: +1 per Thursday for "weekly" items, +1 per
  // first-Thursday-of-month for "monthly" items (e.g. Black Mage). No-ops
  // if no Thursday has passed yet. Called from initialSync() so it always
  // runs against the freshly-synced state, not a stale local copy.
  function applyAutoKills() {
    var today = todayIso();
    var thursdays = thursdaysSince(state.autoLastRun, today);
    if (thursdays.length === 0) return;

    var monthlyHits = thursdays.filter(isFirstThursdayOfMonth).length;
    state.items.forEach(function (it) {
      if (it.cadence === "monthly") {
        it.kills += monthlyHits;
      } else {
        it.kills += thursdays.length;
      }
    });
    state.autoLastRun = today;
    saveState();
  }

  // Tiny DOM-building helper: el("tag", { text, html, className, attrs }).
  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.text != null) node.textContent = opts.text;
    if (opts.html != null) node.innerHTML = opts.html;
    if (opts.className) node.className = opts.className;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    }
    return node;
  }

  // ---- DOM refs ----
  var itemsTbody = document.getElementById("items-tbody");
  var totalKillsEl = document.getElementById("total-kills");
  var totalDropsEl = document.getElementById("total-drops");
  var totalReceivedEl = document.getElementById("total-received");
  var totalRateEl = document.getElementById("total-rate");

  var statLastDrop = document.getElementById("stat-last-drop");
  var statDaysDry = document.getElementById("stat-days-dry");
  var statAvgWeek = document.getElementById("stat-avg-week");

  var logTbody = document.getElementById("log-tbody");

  var bossOptions = document.getElementById("boss-options");
  var itemOptions = document.getElementById("item-options");

  // Bail out entirely if this script somehow loaded on a page without the
  // tracker's markup — everything below assumes these elements exist.
  if (!itemsTbody) return;

  // ---- edit lock ----
  // Gates both local editing AND cloud writes behind one password. Anyone
  // can view the page; only an unlocked device can change or sync data.
  var isUnlocked = localStorage.getItem(EDIT_STORAGE_KEY) === "1";
  var lockBtn = document.getElementById("lock-btn");
  var unlockForm = document.getElementById("unlock-form");
  var unlockInput = document.getElementById("unlock-input");
  var unlockError = document.getElementById("unlock-error");
  var unlockCancel = document.getElementById("unlock-cancel");
  // Every input/button that should be disabled while locked.
  var lockControlledIds = [
    "add-boss", "add-item", "add-kills", "add-drops", "add-received", "add-lastdrop", "add-cadence", "add-item-btn",
    "entry-boss", "entry-item", "entry-received", "entry-date", "entry-submit-btn",
    "import-btn", "merge-import-btn", "clear-btn"
  ];

  // Syncs the lock button's label and disables/enables every controlled
  // input to match the current isUnlocked state.
  function applyLockState() {
    lockBtn.textContent = isUnlocked ? "🔓 Unlocked — click to lock" : "🔒 Locked — click to unlock";
    lockControlledIds.forEach(function (id) {
      var elm = document.getElementById(id);
      if (elm) elm.disabled = !isUnlocked;
    });
  }

  // Clicking while unlocked re-locks immediately (no password needed to
  // lock down again); clicking while locked opens the password form.
  lockBtn.addEventListener("click", function () {
    if (isUnlocked) {
      isUnlocked = false;
      localStorage.removeItem(EDIT_STORAGE_KEY);
      applyLockState();
      renderItemsTable();
      renderLogs();
    } else {
      unlockForm.hidden = false;
      unlockError.textContent = "";
      unlockInput.value = "";
      unlockInput.focus();
    }
  });

  unlockCancel.addEventListener("click", function () {
    unlockForm.hidden = true;
    unlockInput.value = "";
    unlockError.textContent = "";
  });

  // On a correct password: unlock, remember it on this device, re-render
  // (so previously-disabled controls become interactive), and push the
  // current state up to Supabase — this is what seeds the cloud on the
  // very first unlock, and syncs any local-only changes after that.
  unlockForm.addEventListener("submit", function (e) {
    e.preventDefault();
    sha256(unlockInput.value).then(function (hash) {
      if (hash === EDIT_PASSWORD_HASH) {
        isUnlocked = true;
        localStorage.setItem(EDIT_STORAGE_KEY, "1");
        unlockForm.hidden = true;
        unlockInput.value = "";
        unlockError.textContent = "";
        applyLockState();
        renderItemsTable();
        renderLogs();
        pushRemoteState();
      } else {
        unlockError.textContent = "Incorrect password.";
        unlockInput.value = "";
        unlockInput.focus();
      }
    });
  });

  applyLockState();

  // ---- cloud sync wiring ----
  var syncStatusEl = document.getElementById("sync-status");
  // Debounce timer for pushRemoteState, so rapid edits (e.g. typing) don't
  // fire a network request per keystroke.
  var pushTimer = null;

  // Common headers for every Supabase REST call.
  function supabaseHeaders() {
    return { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };
  }

  // Fetches the single shared row from Supabase and returns it (or null if
  // the table is empty). Reads are unconditional — no lock/password needed
  // just to see the latest data.
  function fetchRemoteState() {
    var url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?id=eq." + SUPABASE_ROW_ID + "&select=data,updated_at";
    return fetch(url, { headers: supabaseHeaders() })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
  }

  // Pushes the entire current state up to Supabase in one PATCH. No-ops if
  // editing is locked (nothing should be writing) or the status element
  // isn't on the page. Updates the status line with the result either way.
  function pushRemoteState() {
    if (!isUnlocked || !syncStatusEl) return;
    var url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?id=eq." + SUPABASE_ROW_ID;
    var headers = supabaseHeaders();
    headers.Prefer = "return=minimal";
    fetch(url, {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify({ data: state, updated_at: new Date().toISOString() })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      syncStatusEl.textContent = "Cloud sync: ✓ saved just now.";
    }).catch(function () {
      syncStatusEl.textContent = "Cloud sync: couldn't reach Supabase — this change is only saved on this device for now.";
    });
  }

  // Called from saveState() after every local change; only actually queues
  // a push when unlocked, and collapses bursts of saves into one request.
  function scheduleRemotePush() {
    if (!isUnlocked) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushRemoteState, 600);
  }

  // Treats a Supabase row as "worth adopting" only if it actually has items
  // or log entries — an empty/seed row (e.g. freshly created table) should
  // never be allowed to wipe out a device's local data.
  function isMeaningfulRemoteData(data) {
    if (!data) return false;
    var hasItems = Array.isArray(data.items) && data.items.length > 0;
    var hasEntries = Array.isArray(data.entries) && data.entries.length > 0;
    return hasItems || hasEntries;
  }

  // Thursday kills must be computed AFTER pulling the cloud copy down, not
  // before — otherwise a later-resolving fetch can silently discard a bump
  // that already ran locally, or two devices opening around the same time
  // could each compute their own bump from a stale base and stomp on each
  // other. Syncing first means autoLastRun (itself part of the synced blob)
  // reflects whatever the most recent device already processed, so a
  // Thursday only ever gets counted once across all devices.
  function initialSync() {
    // Runs after the sync attempt settles (success, "nothing to sync yet",
    // or failure) so auto-kills always apply to whatever state we end up
    // with, and the page always finishes in a fully rendered state.
    function finish() {
      applyAutoKills();
      renderAll();
    }
    if (!syncStatusEl) { finish(); return; }
    syncStatusEl.textContent = "Checking cloud sync…";
    fetchRemoteState().then(function (row) {
      if (!isMeaningfulRemoteData(row && row.data)) {
        syncStatusEl.textContent = "Cloud sync: nothing saved in the cloud yet" + (isUnlocked ? " — make a change to start syncing." : ".");
        finish();
        return;
      }
      // Adopt the cloud copy as the new local state.
      state = normalizeState(row.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      syncStatusEl.textContent = "Cloud sync: ✓ loaded the latest from the cloud.";
      finish();
    }).catch(function () {
      syncStatusEl.textContent = "Cloud sync: couldn't reach Supabase — showing what's saved on this device.";
      finish();
    });
  }

  // ---- sorting ----
  // Current sort column/direction for the items table; null key = original order.
  var sortState = { key: null, dir: "asc" };
  var itemsTable = itemsTbody.parentElement;

  // Extracts the comparable value for a given item + sort key.
  function itemSortValue(it, key) {
    switch (key) {
      case "boss": return (it.boss || "").toLowerCase();
      case "item": return (it.item || "").toLowerCase();
      case "kills": return it.kills;
      case "cadence": return it.cadence;
      case "drops": return it.drops;
      case "received": return it.received;
      case "rate": return it.kills > 0 ? it.drops / it.kills : -1;
      case "lastDrop": return it.lastDrop || null;
      default: return null;
    }
  }

  // Returns a sorted copy of state.items according to sortState, with
  // empty/null values always pushed to the end regardless of direction.
  function getSortedItems() {
    var items = state.items.slice();
    if (!sortState.key) return items;
    var key = sortState.key, dir = sortState.dir === "desc" ? -1 : 1;
    items.sort(function (a, b) {
      var av = itemSortValue(a, key), bv = itemSortValue(b, key);
      var aEmpty = av === null || av === undefined || av === "";
      var bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return items;
  }

  // Updates each sortable column header's label with a ▲/▼ arrow and
  // highlight to show which column (and direction) is currently active.
  function updateSortIndicators() {
    var ths = itemsTable.querySelectorAll("thead th[data-sort]");
    ths.forEach(function (th) {
      if (!th.hasAttribute("data-label")) th.setAttribute("data-label", th.textContent);
      var base = th.getAttribute("data-label");
      var isActive = sortState.key === th.getAttribute("data-sort");
      th.classList.toggle("is-active", isActive);
      th.textContent = base + (isActive ? (sortState.dir === "desc" ? " ▼" : " ▲") : "");
    });
  }

  // Clicking a sortable header toggles asc/desc if it's already active,
  // otherwise switches to that column ascending.
  itemsTable.querySelectorAll("thead th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.getAttribute("data-sort");
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = "asc";
      }
      renderItemsTable();
    });
  });

  // ---- rendering ----
  // Rebuilds the whole items table body from state.items (in current sort
  // order), wiring up an editable input/select per field plus a delete
  // button, and recomputes the totals row and sort indicators.
  function renderItemsTable() {
    itemsTbody.innerHTML = "";
    var totalKills = 0, totalDrops = 0, totalReceived = 0;

    getSortedItems().forEach(function (it) {
      totalKills += it.kills;
      totalDrops += it.drops;
      totalReceived += it.received;

      var rate = it.kills > 0 ? ((it.drops / it.kills) * 100).toFixed(2) + "%" : "—";

      var row = el("tr");

      var bossInput = el("input", { attrs: { type: "text" } });
      bossInput.value = it.boss;
      bossInput.addEventListener("change", function () { it.boss = bossInput.value.trim(); saveState(); renderDatalists(); });

      var itemInput = el("input", { attrs: { type: "text" } });
      itemInput.value = it.item;
      itemInput.addEventListener("change", function () { it.item = itemInput.value.trim(); saveState(); renderDatalists(); });

      var killsInput = el("input", { attrs: { type: "number", min: "0" } });
      killsInput.value = it.kills;
      killsInput.addEventListener("change", function () {
        it.kills = Math.max(0, parseInt(killsInput.value, 10) || 0);
        saveState(); renderItemsTable(); renderStats();
      });

      var cadenceSelect = el("select");
      ["weekly", "monthly"].forEach(function (v) {
        var opt = el("option", { text: v === "weekly" ? "Weekly" : "Monthly", attrs: { value: v } });
        cadenceSelect.appendChild(opt);
      });
      cadenceSelect.value = it.cadence === "monthly" ? "monthly" : "weekly";
      cadenceSelect.addEventListener("change", function () { it.cadence = cadenceSelect.value; saveState(); });

      var dropsInput = el("input", { attrs: { type: "number", min: "0" } });
      dropsInput.value = it.drops;
      dropsInput.addEventListener("change", function () {
        it.drops = Math.max(0, parseInt(dropsInput.value, 10) || 0);
        saveState(); renderItemsTable(); renderStats();
      });

      var receivedInput = el("input", { attrs: { type: "number", min: "0" } });
      receivedInput.value = it.received;
      receivedInput.addEventListener("change", function () {
        it.received = Math.max(0, parseInt(receivedInput.value, 10) || 0);
        saveState(); renderItemsTable(); renderStats();
      });

      var lastDropInput = el("input", { attrs: { type: "date" } });
      lastDropInput.value = it.lastDrop || "";
      lastDropInput.addEventListener("change", function () {
        it.lastDrop = lastDropInput.value || null;
        saveState(); renderStats();
      });

      var rateCell = el("td", { text: rate });

      var deleteBtn = el("button", { className: "icon-btn", text: "×", attrs: { type: "button", title: "Remove item" } });
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm("Remove \"" + it.boss + " - " + it.item + "\" and its logged entries?")) return;
        state.items = state.items.filter(function (x) { return x.id !== it.id; });
        state.entries = state.entries.filter(function (e) { return e.itemId !== it.id; });
        saveState();
        renderAll();
      });

      // Every control in this row is disabled while editing is locked.
      [bossInput, itemInput, killsInput, cadenceSelect, dropsInput, receivedInput, lastDropInput, deleteBtn].forEach(function (control) {
        control.disabled = !isUnlocked;
      });

      [bossInput, itemInput, killsInput].forEach(function (input) {
        var td = el("td"); td.appendChild(input); row.appendChild(td);
      });
      var cadenceTd = el("td"); cadenceTd.appendChild(cadenceSelect); row.appendChild(cadenceTd);
      [dropsInput, receivedInput].forEach(function (input) {
        var td = el("td"); td.appendChild(input); row.appendChild(td);
      });
      row.appendChild(rateCell);
      var lastDropTd = el("td"); lastDropTd.appendChild(lastDropInput); row.appendChild(lastDropTd);
      var actionTd = el("td"); actionTd.appendChild(deleteBtn); row.appendChild(actionTd);

      itemsTbody.appendChild(row);
    });

    totalKillsEl.textContent = totalKills;
    totalDropsEl.textContent = totalDrops;
    totalReceivedEl.textContent = totalReceived;
    totalRateEl.textContent = totalKills > 0 ? ((totalDrops / totalKills) * 100).toFixed(2) + "%" : "—";
    updateSortIndicators();
  }

  // Updates the three summary stats: date of the most recent drop across
  // all items, days since then, and average received pitches per week
  // (measured from the earliest logged entry, so it only reflects data
  // actually logged through the app rather than the seeded starting stats).
  function renderStats() {
    var lastDropDate = null;
    state.items.forEach(function (it) {
      if (it.lastDrop && (!lastDropDate || it.lastDrop > lastDropDate)) lastDropDate = it.lastDrop;
    });
    statLastDrop.textContent = lastDropDate ? formatDate(lastDropDate) : "—";

    if (lastDropDate) {
      var days = Math.floor((Date.now() - new Date(lastDropDate + "T00:00:00").getTime()) / DAY_MS);
      statDaysDry.textContent = days >= 0 ? days : 0;
    } else {
      statDaysDry.textContent = "—";
    }

    if (state.entries.length === 0) {
      statAvgWeek.textContent = "—";
    } else {
      var earliest = state.entries.reduce(function (min, e) { return !min || e.date < min ? e.date : min; }, null);
      var receivedCount = state.entries.filter(function (e) { return e.received; }).length;
      var weeks = Math.max((Date.now() - new Date(earliest + "T00:00:00").getTime()) / (7 * DAY_MS), 1 / 7);
      statAvgWeek.textContent = (receivedCount / weeks).toFixed(2);
    }
  }

  // Builds one row of the log table for a single logged pull, with a
  // delete button that also rolls back that entry's effect on its item's
  // drops/received counts.
  function renderLogRow(entry) {
    var it = state.items.find(function (x) { return x.id === entry.itemId; });
    var drop = it ? (it.boss + " - " + it.item) : "(deleted item)";

    var row = el("tr");
    row.appendChild(el("td", { text: formatDate(entry.date) }));
    row.appendChild(el("td", { text: drop }));
    row.appendChild(el("td", { text: entry.received ? "Received" : "Not received", className: entry.received ? "outcome-good" : "outcome-bad" }));

    var deleteBtn = el("button", { className: "icon-btn", text: "×", attrs: { type: "button", title: "Delete entry" } });
    deleteBtn.disabled = !isUnlocked;
    deleteBtn.addEventListener("click", function () {
      state.entries = state.entries.filter(function (e) { return e.id !== entry.id; });
      if (it) {
        it.drops = Math.max(0, it.drops - 1);
        if (entry.received) it.received = Math.max(0, it.received - 1);
      }
      saveState();
      renderAll();
    });
    var actionTd = el("td"); actionTd.appendChild(deleteBtn); row.appendChild(actionTd);

    return row;
  }

  // Rebuilds the log table, newest entry first.
  function renderLogs() {
    var sorted = state.entries.slice().sort(function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });

    logTbody.innerHTML = "";
    if (sorted.length === 0) {
      logTbody.appendChild(el("tr", { html: '<td colspan="4" class="log-empty">No entries logged yet.</td>' }));
    } else {
      sorted.forEach(function (e) { logTbody.appendChild(renderLogRow(e)); });
    }
  }

  // Refreshes the <datalist> autocomplete options for boss/item name inputs
  // from whatever's currently tracked, so typing suggests existing entries.
  function renderDatalists() {
    var bosses = [], items = [];

    state.items.forEach(function (it) {
      if (bosses.indexOf(it.boss) === -1) bosses.push(it.boss);
      if (items.indexOf(it.item) === -1) items.push(it.item);
    });

    function fill(datalist, values) {
      datalist.innerHTML = "";
      values.forEach(function (v) { datalist.appendChild(el("option", { attrs: { value: v } })); });
    }
    fill(bossOptions, bosses);
    fill(itemOptions, items);
  }

  // Re-renders every part of the page from the current state.
  function renderAll() {
    renderItemsTable();
    renderStats();
    renderLogs();
    renderDatalists();
    updateAutoKillNote();
  }

  // ---- add item (inline row) ----
  var addBoss = document.getElementById("add-boss");
  var addItem = document.getElementById("add-item");
  var addKills = document.getElementById("add-kills");
  var addDrops = document.getElementById("add-drops");
  var addReceived = document.getElementById("add-received");
  var addLastDrop = document.getElementById("add-lastdrop");
  var addCadence = document.getElementById("add-cadence");
  var addItemBtn = document.getElementById("add-item-btn");

  // Adds a brand-new tracked boss/item from the inline "add row" form,
  // rejecting empty names or a boss+item pair that's already tracked.
  addItemBtn.addEventListener("click", function () {
    var boss = addBoss.value.trim(), item = addItem.value.trim();
    if (!boss || !item) { window.alert("Enter both a boss and an item name."); return; }
    if (findItem(boss, item)) { window.alert("That boss/item is already tracked."); return; }

    state.items.push({
      id: makeId(),
      boss: boss,
      item: item,
      kills: Math.max(0, parseInt(addKills.value, 10) || 0),
      drops: Math.max(0, parseInt(addDrops.value, 10) || 0),
      received: Math.max(0, parseInt(addReceived.value, 10) || 0),
      lastDrop: addLastDrop.value || null,
      cadence: addCadence.value === "monthly" ? "monthly" : "weekly"
    });
    saveState();
    addBoss.value = ""; addItem.value = ""; addKills.value = ""; addDrops.value = ""; addReceived.value = ""; addLastDrop.value = ""; addCadence.value = "weekly";
    renderAll();
  });

  // ---- log entry form ----
  var entryForm = document.getElementById("entry-form");
  var entryBoss = document.getElementById("entry-boss");
  var entryItem = document.getElementById("entry-item");
  var entryReceived = document.getElementById("entry-received");
  var entryDate = document.getElementById("entry-date");

  entryDate.value = todayIso();

  // Logs a pull: finds (or auto-creates) the matching item, bumps its
  // drops/received/lastDrop, and records the individual log entry.
  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var boss = entryBoss.value.trim(), itemName = entryItem.value.trim();
    if (!boss || !itemName || !entryDate.value) return;

    var it = findItem(boss, itemName);
    if (!it) {
      it = { id: makeId(), boss: boss, item: itemName, kills: 0, drops: 0, received: 0, lastDrop: null, cadence: "weekly" };
      state.items.push(it);
    }

    var received = entryReceived.value === "yes";
    it.drops += 1;
    if (received) it.received += 1;
    if (!it.lastDrop || entryDate.value > it.lastDrop) it.lastDrop = entryDate.value;

    state.entries.push({
      id: makeId(),
      itemId: it.id,
      date: entryDate.value,
      received: received
    });

    saveState();
    entryItem.value = "";
    entryDate.value = todayIso();
    renderAll();
  });

  // ---- backup / restore / clear ----
  // Downloads the entire current state as a JSON file, for manual backup
  // or moving data to a device without going through cloud sync.
  document.getElementById("export-btn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "maple-pitch-diary-" + todayIso() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Replaces the entire diary with a previously downloaded backup file,
  // after confirming with the user since this is destructive.
  var importFile = document.getElementById("import-file");
  document.getElementById("import-btn").addEventListener("click", function () { importFile.click(); });
  importFile.addEventListener("change", function () {
    var file = importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.entries)) throw new Error("bad shape");
        if (!window.confirm("Replace the current diary with this backup?")) return;
        state = normalizeState(parsed);
        saveState();
        renderAll();
      } catch (err) {
        window.alert("That file doesn't look like a valid pitch diary backup.");
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  // Adds log rows for pulls already reflected in the overview's Kills/Drops/Received
  // totals, so it deliberately does not touch item stats — only findItem() + entries.push().
  var mergeImportFile = document.getElementById("merge-import-file");
  document.getElementById("merge-import-btn").addEventListener("click", function () { mergeImportFile.click(); });
  mergeImportFile.addEventListener("change", function () {
    var file = mergeImportFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = JSON.parse(reader.result);
        if (!Array.isArray(rows)) throw new Error("bad shape");

        var added = 0, skippedDup = 0, notFound = [];
        rows.forEach(function (row) {
          var it = findItem(row.boss, row.item);
          if (!it) { notFound.push(row.boss + " - " + row.item); return; }

          var received = !!row.received;
          var isDup = state.entries.some(function (e) {
            return e.itemId === it.id && e.date === row.date && e.received === received;
          });
          if (isDup) { skippedDup++; return; }

          state.entries.push({ id: makeId(), itemId: it.id, date: row.date, received: received });
          added++;
        });

        saveState();
        renderAll();

        var msg = "Added " + added + " log " + (added === 1 ? "entry" : "entries") + ".";
        if (skippedDup) msg += " Skipped " + skippedDup + " already-logged duplicate" + (skippedDup === 1 ? "" : "s") + ".";
        if (notFound.length) msg += " Couldn't match " + notFound.length + " row(s) to an existing item: " + notFound.join(", ") + ".";
        window.alert(msg);
      } catch (err) {
        window.alert("That file doesn't look like a valid log import.");
      }
      mergeImportFile.value = "";
    };
    reader.readAsText(file);
  });

  // Wipes every tracked item and log entry on this device, after confirming.
  document.getElementById("clear-btn").addEventListener("click", function () {
    if (!window.confirm("Clear the entire diary? This deletes all tracked items and log entries on this device.")) return;
    state = { items: [], entries: [], autoLastRun: todayIso() };
    saveState();
    renderAll();
  });

  // Updates the small note explaining the auto-kill mechanic and showing
  // when it last checked for a passed Thursday.
  function updateAutoKillNote() {
    var note = document.getElementById("auto-kill-note");
    if (!note) return;
    note.textContent = "Kills tick up automatically every Thursday reset (Black Mage on the first Thursday of the month) — last checked " + formatDate(state.autoLastRun) + ".";
  }

  // Paint immediately with whatever's cached locally, then kick off the
  // cloud sync (which applies auto-kills and re-renders once it settles).
  renderAll();
  initialSync();
})();
