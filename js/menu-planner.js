(function () {
  // localStorage key the whole planner (recipes + log + settings) is saved under.
  var STORAGE_KEY = "menu-planner-v1";
  var DAY_MS = 86400000;

  // ---- cloud sync (Supabase) ----
  // Single shared row, no per-user auth — a passphrase just gates pushing
  // writes, matching the "not real security, just a deterrent" gates used
  // elsewhere on this site (see js/gate.js, js/tracker-gate.js history).
  var SUPABASE_URL = "https://jhmctzavhpprbokdlbwe.supabase.co";
  var SUPABASE_KEY = "sb_publishable_0NQ1jx8nVQdTlREiNCkTiw_MJfZTLyU";
  var SUPABASE_TABLE = "menu_planner_state";
  var SUPABASE_ROW_ID = "default";
  var SYNC_UNLOCK_KEY = "menu_sync_unlocked";
  var SYNC_PASSWORD_HASH = "9e68ae360e4f5833da1cb93ab5b96f76e79e696ee7b5c6409d6db865d3a273ae";

  // Hashes a string with SHA-256 and returns the lowercase hex digest, used
  // to check the typed passphrase against SYNC_PASSWORD_HASH without ever
  // comparing or storing the plain text.
  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  // The fixed set of valid values for each recipe field — also drives every
  // <select> and settings input built dynamically below.
  var CARB_CATEGORIES = ["Rice", "Potato", "Noodles", "Pasta", "Wheat", "Congee", "Soup"];
  var MEAT_CATEGORIES = ["Chicken", "Beef", "Fish", "None", "Pork"];
  var REPEAT_LEVELS = ["Regular", "Occasionally", "Rarely", "New"];
  var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Recipes tagged less-repeatable get a longer natural cooldown than the flat
  // lookback window before they're eligible again. Fallback tier 1 (see
  // generateWeek) relaxes this back to the flat window for "Occasionally"
  // dishes specifically, matching "allow Occasionally-repeated recipes
  // outside 14 days but within 21" from the spec.
  var COOLDOWN_MULTIPLIER = { Regular: 1, Occasionally: 1.5, Rarely: 2, New: 2 };

  // The generator's tunable knobs, editable via the Settings modal.
  function defaultSettings() {
    return {
      carbQuotas: { Rice: 4, Potato: 1, Noodles: 1, Pasta: 1, Wheat: 0, Congee: 0, Soup: 0 },
      meatRatios: { Chicken: 40, Beef: 30, Fish: 10, None: 10, Pork: 10 },
      weights: { Regular: 60, Occasionally: 25, Rarely: 10, New: 5 },
      lookbackDays: 14,
      maxNewPerWeek: 1
    };
  }

  // Short unique-enough id for recipes/log entries — good enough for a
  // single shared dataset, not meant to be globally unique.
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Seeded so any browser/device opening this page for the first time starts
  // with the full recipe list already in place — no import step needed.
  var DEFAULT_RECIPES = [
    { name: "Creamy Beef Rice", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Risotto", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "One Pot Rice", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Chicken Teriyaki", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Enoki Beefrolls", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Occasionally" },
    { name: "Japanese Beef Curry", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Japanese Chicken Curry", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Fried Rice", carbCategory: "Rice", meatCategory: "Pork", repeatability: "Regular" },
    { name: "Steamed Eggs", carbCategory: "Rice", meatCategory: "None", repeatability: "Regular" },
    { name: "Eggs and Spam over Rice", carbCategory: "Rice", meatCategory: "Pork", repeatability: "Occasionally" },
    { name: "Chicken Madras", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Rarely" },
    { name: "Chicken Tandoori", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Rarely" },
    { name: "Bimbimbap", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Tofu Stew", carbCategory: "Rice", meatCategory: "None", repeatability: "Rarely" },
    { name: "Ma Po Tofu", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Minced Beef and Egg over rice", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Oyakodon", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Occasionally" },
    { name: "Steak Rice Don", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Haianese Chicken", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Beef Pepper Rice", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Chicken Skin with Rice", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Occasionally" },
    { name: "Steamed Cod", carbCategory: "Rice", meatCategory: "Fish", repeatability: "Regular" },
    { name: "Tomato Egg with Beef", carbCategory: "Rice", meatCategory: "Beef", repeatability: "Occasionally" },
    { name: "Chicken Skewers", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Braised Chicken Shiitake", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Rarely" },
    { name: "Hong Shao Rou", carbCategory: "Rice", meatCategory: "Pork", repeatability: "Rarely" },
    { name: "Steamed Chicken with Earwood Mushroom", carbCategory: "Rice", meatCategory: "Chicken", repeatability: "Occasionally" },
    { name: "Miso Cod", carbCategory: "Rice", meatCategory: "Fish", repeatability: "Rarely" },
    { name: "Mushroom Rice Cooker", carbCategory: "Rice", meatCategory: "None", repeatability: "Rarely" },
    { name: "Pork Chop with Curry", carbCategory: "Rice", meatCategory: "Pork", repeatability: "Rarely" },
    { name: "Ochasuke", carbCategory: "Rice", meatCategory: "None", repeatability: "New" },
    { name: "Niku Udon", carbCategory: "Noodles", meatCategory: "Beef", repeatability: "Occasionally" },
    { name: "Beef Ho Fan", carbCategory: "Noodles", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Jap Chae", carbCategory: "Noodles", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Congee with Chicken", carbCategory: "Congee", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Miso Pasta", carbCategory: "Pasta", meatCategory: "None", repeatability: "Occasionally" },
    { name: "Gnocchi Cream Chicken Pancetta", carbCategory: "Pasta", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Mushroom Spinach Lasagne", carbCategory: "Pasta", meatCategory: "None", repeatability: "Occasionally" },
    { name: "Chicken Alfredo Pasta", carbCategory: "Pasta", meatCategory: "Chicken", repeatability: "Regular" },
    { name: "Spaghetti Meatballs", carbCategory: "Pasta", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Scallop/Shrimp Lemon Linguine", carbCategory: "Pasta", meatCategory: "Fish", repeatability: "Occasionally" },
    { name: "Creamy Pasta Sausage & Pumpkin", carbCategory: "Pasta", meatCategory: "Pork", repeatability: "Rarely" },
    { name: "Rice Cake Soup", carbCategory: "Soup", meatCategory: "None", repeatability: "Rarely" },
    { name: "Creamy Chicken Noodle Soup", carbCategory: "Soup", meatCategory: "Chicken", repeatability: "Rarely" },
    { name: "Radish Short Rib Soup", carbCategory: "Soup", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Lasagne Soup", carbCategory: "Soup", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Burrito", carbCategory: "Wheat", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Birria Tacos", carbCategory: "Wheat", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Quiche Beef Celery Wortel Mushroom", carbCategory: "Wheat", meatCategory: "Beef", repeatability: "Rarely" },
    { name: "Loaded Taco Bowl", carbCategory: "Potato", meatCategory: "Beef", repeatability: "Regular" },
    { name: "Steak and Fries", carbCategory: "Potato", meatCategory: "Beef", repeatability: "Regular" }
  ];

  // Builds a brand-new state object from DEFAULT_RECIPES, each with a fresh id.
  function defaultState() {
    return {
      recipes: DEFAULT_RECIPES.map(function (r) {
        return { id: makeId(), name: r.name, carbCategory: r.carbCategory, meatCategory: r.meatCategory, repeatability: r.repeatability };
      }),
      log: [],
      settings: defaultSettings()
    };
  }

  // Fills in/repairs fields on state loaded from localStorage or Supabase —
  // guarantees every settings key exists (merging in any new defaults added
  // since the data was saved) so older saved data never breaks the app.
  function normalizeState(raw) {
    if (!Array.isArray(raw.recipes)) raw.recipes = [];
    if (!Array.isArray(raw.log)) raw.log = [];
    var d = defaultSettings();
    raw.settings = raw.settings || {};
    raw.settings.carbQuotas = Object.assign({}, d.carbQuotas, raw.settings.carbQuotas || {});
    raw.settings.meatRatios = Object.assign({}, d.meatRatios, raw.settings.meatRatios || {});
    raw.settings.weights = Object.assign({}, d.weights, raw.settings.weights || {});
    raw.settings.lookbackDays = raw.settings.lookbackDays || d.lookbackDays;
    raw.settings.maxNewPerWeek = raw.settings.maxNewPerWeek != null ? raw.settings.maxNewPerWeek : d.maxNewPerWeek;
    return raw;
  }

  // Reads whatever's saved on this device, falling back to a freshly seeded
  // state (with the default recipe list) if nothing's saved yet.
  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw) return normalizeState(raw);
    } catch (e) {}
    return defaultState();
  }

  // Persists the current state locally and schedules a push to Supabase
  // (scheduleRemotePush no-ops on its own if sync isn't unlocked).
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleRemotePush();
  }

  var state = loadState();

  // ---- date helpers ----
  function pad2(n) { return String(n).padStart(2, "0"); }
  // Local date -> "YYYY-MM-DD".
  function toIso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  // "YYYY-MM-DD" -> local Date.
  function fromIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  // "YYYY-MM-DD" -> "DD-MM-YYYY" for display.
  function formatDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    return p[2] + "-" + p[1] + "-" + p[0];
  }
  // Strips the time portion so date-only comparisons ignore hours/minutes.
  function midnight(d) { var n = new Date(d); n.setHours(0, 0, 0, 0); return n; }
  // Whole days between two dates (b - a), ignoring time of day.
  function daysBetween(a, b) { return Math.floor((midnight(b) - midnight(a)) / DAY_MS); }
  function addDays(d, n) { var n2 = new Date(d); n2.setDate(n2.getDate() + n); return n2; }
  // Monday of the week containing d (Sunday counts as the end of the prior week).
  function mondayOf(d) {
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    return midnight(addDays(d, diff));
  }
  // Monday of the week AFTER d's week — "next week" always means the full
  // 7-day block after the current calendar week, regardless of what day it is today.
  function nextMondayFrom(d) { return addDays(mondayOf(d), 7); }

  // ---- seeded PRNG (mulberry32) ----
  // Deterministic random generator: same seed always produces the same
  // sequence, so a generated week can be reproduced by reusing its seed.
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Fisher-Yates shuffle using the given (optionally seeded) RNG; returns a new array.
  function shuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  // Picks one recipe from pool at random, weighted by each recipe's
  // repeatability weight (higher weight = more likely to be picked).
  function weightedPick(pool, weights, rand) {
    var total = pool.reduce(function (s, r) { return s + (weights[r.repeatability] || 1); }, 0);
    if (total <= 0) return pool[Math.floor(rand() * pool.length)];
    var roll = rand() * total;
    for (var i = 0; i < pool.length; i++) {
      roll -= weights[pool[i].repeatability] || 1;
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // ---- quota / ratio expansion ----
  // Expands carb quotas (e.g. Rice:4, Potato:1, ...) into a flat 7-item
  // array of carb categories, one per day. Pads with Rice or truncates (with
  // a warning either way) if the quotas don't add up to exactly 7, so
  // generation never hard-fails on a misconfigured Settings panel.
  function buildCarbSlots(quotas) {
    var slots = [];
    CARB_CATEGORIES.forEach(function (cat) {
      for (var i = 0; i < (quotas[cat] || 0); i++) slots.push(cat);
    });
    var warnings = [];
    if (slots.length > 7) {
      warnings.push("Carb quotas add up to " + slots.length + ", not 7 — extra slots were dropped. Fix this in Settings.");
      slots = slots.slice(0, 7);
    } else if (slots.length < 7) {
      var short = 7 - slots.length;
      warnings.push("Carb quotas add up to " + (7 - short) + ", not 7 — padded the rest with Rice. Fix this in Settings.");
      for (var j = 0; j < short; j++) slots.push("Rice");
    }
    return { slots: slots, warnings: warnings };
  }

  // Converts meat ratio percentages into whole-dish counts summing to
  // totalDays using the largest-remainder method: floor each category's
  // exact share, then hand out the leftover slots to whichever categories
  // had the biggest fractional remainder. Also returns a breakdown (used to
  // show "how this rounded" on the page) and the raw percentage sum (used
  // to warn if the ratios don't add up to 100).
  function buildMeatSlots(ratios, totalDays) {
    totalDays = totalDays || 7;
    var exact = {}, floorVal = {}, remainder = {}, flooredSum = 0;
    MEAT_CATEGORIES.forEach(function (cat) {
      var pct = ratios[cat] || 0;
      exact[cat] = (pct / 100) * totalDays;
      floorVal[cat] = Math.floor(exact[cat]);
      remainder[cat] = exact[cat] - floorVal[cat];
      flooredSum += floorVal[cat];
    });
    var remaining = totalDays - flooredSum;
    var order = MEAT_CATEGORIES.slice().sort(function (a, b) { return remainder[b] - remainder[a]; });
    var counts = Object.assign({}, floorVal);
    for (var i = 0; i < remaining && i < order.length; i++) counts[order[i]]++;
    var slots = [];
    MEAT_CATEGORIES.forEach(function (cat) {
      for (var k = 0; k < counts[cat]; k++) slots.push(cat);
    });
    var breakdown = MEAT_CATEGORIES.map(function (cat) {
      return { cat: cat, pct: ratios[cat] || 0, exact: exact[cat], count: counts[cat] };
    });
    var sumPct = MEAT_CATEGORIES.reduce(function (s, c) { return s + (ratios[c] || 0); }, 0);
    return { slots: slots, breakdown: breakdown, sumPct: sumPct };
  }

  // ---- recipe history helpers ----
  // Most recent dateServed logged for a recipe, or null if it's never been logged.
  function lastServedDate(recipeId) {
    var latest = null;
    state.log.forEach(function (e) {
      if (e.recipeId !== recipeId) return;
      var d = fromIso(e.dateServed);
      if (!latest || d > latest) latest = d;
    });
    return latest;
  }
  // Primary repetition rule: excluded if served within its own cooldown,
  // where less-repeatable recipes (Rarely/New) get a longer cooldown than
  // the flat lookback window (see COOLDOWN_MULTIPLIER).
  function isExcludedTiered(r, today, lookbackDays) {
    var last = lastServedDate(r.id);
    if (!last) return false;
    var mult = COOLDOWN_MULTIPLIER[r.repeatability] || 1;
    var cooldown = Math.round(lookbackDays * mult);
    return daysBetween(last, today) < cooldown;
  }
  // Fallback-tier rule: excluded only if served within the flat lookback
  // window, ignoring the per-repeatability multiplier — used to relax
  // "Occasionally" dishes back to the base window when the strict pool is empty.
  function isExcludedFlat(r, today, lookbackDays) {
    var last = lastServedDate(r.id);
    if (!last) return false;
    return daysBetween(last, today) < lookbackDays;
  }

  // ---- core generation ----
  // Builds one full 7-day draft week for "next week" (Mon–Sun), given a PRNG
  // seed. High-level steps:
  //   1. Expand carb quotas and meat ratios into two 7-item slot arrays,
  //      independently shuffled, then paired up day-by-day.
  //   2. For each day's (carb, meat) target, try a sequence of eligibility
  //      pools from strictest to most relaxed (see the `attempts` array
  //      below) and weighted-randomly pick a recipe from the first
  //      non-empty one, tracking which recipes are already used this week
  //      and how many "New" dishes have been used (capped by settings).
  //   3. Any day that still finds nothing eligible is left unfilled with a
  //      warning, for the user to fill in manually.
  // Returns the draft plus a list of warnings explaining any fallback/rounding used.
  function generateWeek(seedValue) {
    var settings = state.settings;
    var rand = mulberry32(seedValue >>> 0);
    var today = midnight(new Date());
    var weekStart = nextMondayFrom(today);

    var carbResult = buildCarbSlots(settings.carbQuotas);
    var meatResult = buildMeatSlots(settings.meatRatios);
    var warnings = carbResult.warnings.slice();
    if (Math.round(meatResult.sumPct) !== 100) {
      warnings.push("Meat ratios add up to " + meatResult.sumPct + "%, not 100% — counts below are based on the raw values. Fix this in Settings.");
    }

    var carbSlots = shuffle(carbResult.slots, rand);
    var meatSlots = shuffle(meatResult.slots, rand);
    var pairs = carbSlots.map(function (c, i) { return { carb: c, meat: meatSlots[i] }; });

    var dailyUsedIds = {};
    var newCount = 0;
    var days = [];

    function newCapOk(r) { return r.repeatability !== "New" || newCount < settings.maxNewPerWeek; }

    pairs.forEach(function (pair, i) {
      var carb = pair.carb, meat = pair.meat;
      // Eligibility pools tried in order, strictest first. The first
      // non-empty one wins; tier > 0 means a fallback rule kicked in, which
      // gets surfaced to the user as a warning.
      var attempts = [
        {
          // Tier 0: exact carb+meat match, not used elsewhere this week,
          // not in its repetition cooldown, respects the New-dish cap.
          tier: 0,
          list: state.recipes.filter(function (r) {
            return r.carbCategory === carb && r.meatCategory === meat && !dailyUsedIds[r.id] &&
              !isExcludedTiered(r, today, settings.lookbackDays) && newCapOk(r);
          })
        },
        {
          // Tier 1: relax an Occasionally-tagged dish back to the flat
          // lookback window instead of its longer tiered cooldown.
          tier: 1,
          msg: "relaxed the repeat window for an Occasionally-repeated dish",
          list: state.recipes.filter(function (r) {
            return r.carbCategory === carb && r.meatCategory === meat && r.repeatability === "Occasionally" &&
              !dailyUsedIds[r.id] && !isExcludedFlat(r, today, settings.lookbackDays) && newCapOk(r);
          })
        },
        {
          // Tier 2: allow repeating a dish already used earlier this week.
          tier: 2,
          msg: "repeated a dish already used earlier this week",
          list: state.recipes.filter(function (r) {
            return r.carbCategory === carb && r.meatCategory === meat &&
              !isExcludedTiered(r, today, settings.lookbackDays) && newCapOk(r);
          })
        },
        {
          // Tier 3: drop the meat requirement, keep the carb requirement.
          tier: 3,
          msg: "relaxed the meat ratio for this day",
          list: state.recipes.filter(function (r) {
            return r.carbCategory === carb && !dailyUsedIds[r.id] &&
              !isExcludedTiered(r, today, settings.lookbackDays) && newCapOk(r);
          })
        },
        {
          // Tier 4: drop the meat requirement AND allow a same-week repeat —
          // last resort before leaving the day unfilled.
          tier: 4,
          msg: "relaxed the meat ratio and repeated a dish used this week",
          list: state.recipes.filter(function (r) {
            return r.carbCategory === carb && !isExcludedTiered(r, today, settings.lookbackDays) && newCapOk(r);
          })
        }
      ];

      var chosen = null, usedTier = null;
      for (var t = 0; t < attempts.length; t++) {
        if (attempts[t].list.length > 0) {
          chosen = weightedPick(attempts[t].list, settings.weights, rand);
          usedTier = attempts[t];
          break;
        }
      }

      var date = addDays(weekStart, i);
      if (chosen) {
        dailyUsedIds[chosen.id] = true;
        if (chosen.repeatability === "New") newCount++;
        if (usedTier.tier > 0) {
          warnings.push(DAY_NAMES[i] + ": " + usedTier.msg + " (" + carb + " + " + meat + ").");
        }
      } else {
        warnings.push(DAY_NAMES[i] + ": no eligible " + carb + " + " + meat + " dish — pool exhausted or all recently used. Pick one manually.");
      }

      days.push({
        dayName: DAY_NAMES[i],
        date: toIso(date),
        carb: carb,
        meat: meat,
        recipeId: chosen ? chosen.id : null,
        special: null // set to "order"/"eatout" via the manual picker, never by the generator itself
      });
    });

    return { weekStart: toIso(weekStart), seed: seedValue, days: days, warnings: warnings, meatBreakdown: meatResult.breakdown };
  }

  // ---- DOM refs ----
  var weekTbody = document.getElementById("week-tbody");
  var recipesTbody = document.getElementById("recipes-tbody");
  var recipesEmptyNote = document.getElementById("recipes-empty-note");
  var warningListEl = document.getElementById("warning-list");
  var ratioBreakdownEl = document.getElementById("ratio-breakdown");
  var historyListEl = document.getElementById("history-list");
  var seedInput = document.getElementById("seed-input");
  var confirmBtn = document.getElementById("confirm-log-btn");

  // Bail out if this script somehow loaded on a page without the planner's
  // markup — everything below assumes these elements exist.
  if (!weekTbody) return;

  // ---- cloud sync wiring ----
  // Reading the cloud copy is always allowed; only pushing changes up
  // requires unlocking with SYNC_PASSWORD_HASH, remembered per device.
  var isSyncUnlocked = localStorage.getItem(SYNC_UNLOCK_KEY) === "1";
  var syncLockBtn = document.getElementById("sync-lock-btn");
  var syncUnlockForm = document.getElementById("sync-unlock-form");
  var syncUnlockInput = document.getElementById("sync-unlock-input");
  var syncUnlockError = document.getElementById("sync-unlock-error");
  var syncUnlockCancel = document.getElementById("sync-unlock-cancel");
  var syncStatusEl = document.getElementById("sync-status");
  // Debounce timer for pushRemoteState, so rapid edits don't fire a network request each.
  var pushTimer = null;

  // Common headers for every Supabase REST call.
  function supabaseHeaders() {
    return { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };
  }

  // Fetches the single shared row from Supabase (or null if the table's empty).
  function fetchRemoteState() {
    var url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?id=eq." + SUPABASE_ROW_ID + "&select=data,updated_at";
    return fetch(url, { headers: supabaseHeaders() })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
  }

  // Pushes the entire current state up to Supabase in one PATCH, updating
  // the status line with the result either way.
  function pushRemoteState() {
    var url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?id=eq." + SUPABASE_ROW_ID;
    var headers = supabaseHeaders();
    headers.Prefer = "return=minimal";
    return fetch(url, {
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
  // a push when sync is unlocked, and collapses bursts of saves into one request.
  function scheduleRemotePush() {
    if (!isSyncUnlocked) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushRemoteState, 600);
  }

  // Syncs the lock button's label to the current isSyncUnlocked state.
  function applySyncLockState() {
    syncLockBtn.textContent = isSyncUnlocked
      ? "🔓 Cloud sync unlocked — click to lock"
      : "🔒 Cloud sync locked — click to unlock";
  }

  // Clicking while unlocked re-locks immediately (no password needed);
  // clicking while locked opens the passphrase form.
  syncLockBtn.addEventListener("click", function () {
    if (isSyncUnlocked) {
      isSyncUnlocked = false;
      localStorage.removeItem(SYNC_UNLOCK_KEY);
      applySyncLockState();
      syncStatusEl.textContent = "Cloud sync locked — changes here will only save on this device.";
    } else {
      syncUnlockForm.hidden = false;
      syncUnlockError.textContent = "";
      syncUnlockInput.value = "";
      syncUnlockInput.focus();
    }
  });
  syncUnlockCancel.addEventListener("click", function () {
    syncUnlockForm.hidden = true;
    syncUnlockInput.value = "";
    syncUnlockError.textContent = "";
  });
  // On a correct passphrase: unlock, remember it on this device, and
  // immediately push — this is what seeds the cloud on the very first
  // unlock, and syncs any local-only changes after that.
  syncUnlockForm.addEventListener("submit", function (e) {
    e.preventDefault();
    sha256(syncUnlockInput.value).then(function (hash) {
      if (hash === SYNC_PASSWORD_HASH) {
        isSyncUnlocked = true;
        localStorage.setItem(SYNC_UNLOCK_KEY, "1");
        syncUnlockForm.hidden = true;
        syncUnlockInput.value = "";
        syncUnlockError.textContent = "";
        applySyncLockState();
        pushRemoteState();
      } else {
        syncUnlockError.textContent = "Incorrect password.";
        syncUnlockInput.value = "";
        syncUnlockInput.focus();
      }
    });
  });

  // Treats a Supabase row as "worth adopting" only if it actually has
  // recipes or log entries — an empty/seed row should never wipe out a
  // device's local data.
  function isMeaningfulRemoteData(data) {
    if (!data) return false;
    var hasRecipes = Array.isArray(data.recipes) && data.recipes.length > 0;
    var hasLog = Array.isArray(data.log) && data.log.length > 0;
    return hasRecipes || hasLog;
  }

  // Runs once on page load: pulls the cloud copy down and adopts it (if
  // meaningful), then re-renders everything so the page reflects the
  // latest shared data rather than just whatever was cached locally.
  function initialSync() {
    applySyncLockState();
    syncStatusEl.textContent = "Checking cloud sync…";
    fetchRemoteState().then(function (row) {
      if (!isMeaningfulRemoteData(row && row.data)) {
        syncStatusEl.textContent = "Cloud sync: nothing saved in the cloud yet — unlock and make a change to start syncing.";
        return;
      }
      state = normalizeState(row.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      syncStatusEl.textContent = "Cloud sync: ✓ loaded the latest from the cloud.";
      renderAllViews();
    }).catch(function () {
      syncStatusEl.textContent = "Cloud sync: couldn't reach Supabase — showing what's saved on this device.";
    });
  }

  // Tiny DOM-building helper: el("tag", { text, html, className, attrs }).
  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.text != null) node.textContent = opts.text;
    if (opts.html != null) node.innerHTML = opts.html;
    if (opts.className) node.className = opts.className;
    if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    return node;
  }
  // Fills a <select> with <option>s for each value, optionally with a blank
  // "— choose —" option first.
  function fillSelect(select, values, withBlank) {
    select.innerHTML = "";
    if (withBlank) select.appendChild(el("option", { text: "— choose —", attrs: { value: "" } }));
    values.forEach(function (v) { select.appendChild(el("option", { text: v, attrs: { value: v } })); });
  }

  var draft = null; // current in-memory week draft, not persisted until confirmed

  // ---- dish photo hover preview ----
  // Convention-based, no manifest to maintain: looks for an image file named
  // after the recipe. Tries the resized dishes/thumb/ copy first (fast); if
  // that's missing it falls back to the original file directly under
  // dishes/ in a few common extensions, so a freshly-dropped-in photo shows
  // up immediately even before anyone resizes it into thumb/.
  var dishImageCache = {}; // slug -> resolved url string, or false if not found

  // Strips characters that aren't valid in filenames, matching how a recipe
  // name like "Scallop/Shrimp ..." ends up saved as "ScallopShrimp ...".
  function dishSlug(name) {
    return (name || "").replace(/[\\/:*?"<>|]/g, "").trim();
  }

  // Every filename this recipe's photo might be saved as, tried in order.
  function dishImageCandidates(name) {
    var slug = dishSlug(name);
    return [
      "dishes/thumb/" + slug + ".jpg",
      "dishes/" + slug + ".jpg",
      "dishes/" + slug + ".JPG",
      "dishes/" + slug + ".jpeg",
      "dishes/" + slug + ".JPEG",
      "dishes/" + slug + ".png",
      "dishes/" + slug + ".PNG"
    ];
  }

  // Finds (and caches) the first candidate image URL that actually loads
  // for a given recipe name; calls back with the URL, or false if none exist.
  function resolveDishImage(name, callback) {
    var slug = dishSlug(name);
    if (!slug) { callback(false); return; }
    if (Object.prototype.hasOwnProperty.call(dishImageCache, slug)) { callback(dishImageCache[slug]); return; }

    var candidates = dishImageCandidates(name);
    var i = 0;
    function tryNext() {
      if (i >= candidates.length) { dishImageCache[slug] = false; callback(false); return; }
      var url = candidates[i++];
      var probe = new Image();
      probe.onload = function () { dishImageCache[slug] = url; callback(url); };
      probe.onerror = tryNext;
      probe.src = url;
    }
    tryNext();
  }

  // Single floating preview element reused for every hover, repositioned
  // and re-sourced on the fly rather than creating one per dish.
  var dishPreviewEl = el("div", { className: "dish-preview" });
  var dishPreviewImg = el("img");
  dishPreviewEl.appendChild(dishPreviewImg);
  document.body.appendChild(dishPreviewEl);

  // Positions the preview near the cursor, flipping to the other side of
  // the cursor if it would otherwise run off the right/bottom edge.
  function positionDishPreview(evt) {
    var margin = 16;
    var boxW = 396, boxH = 336; // matches .dish-preview img max size + border
    var x = evt.clientX + margin, y = evt.clientY + margin;
    var maxX = window.innerWidth - boxW;
    var maxY = window.innerHeight - boxH;
    if (x > maxX) x = evt.clientX - boxW - margin;
    if (y > maxY) y = evt.clientY - boxH - margin;
    dishPreviewEl.style.left = Math.max(8, x) + "px";
    dishPreviewEl.style.top = Math.max(8, y) + "px";
  }

  function hideDishPreview() {
    dishPreviewEl.classList.remove("is-visible");
  }

  // Wires up hover-to-preview on any element that displays a dish name:
  // shows the photo (if one resolves) on mouseenter, tracks the cursor
  // while hovering, and hides on mouseleave.
  function attachDishHover(target, name) {
    target.addEventListener("mouseenter", function (e) {
      resolveDishImage(name, function (url) {
        if (!url) return;
        dishPreviewImg.src = url;
        positionDishPreview(e);
        dishPreviewEl.classList.add("is-visible");
      });
    });
    target.addEventListener("mousemove", function (e) {
      if (dishPreviewEl.classList.contains("is-visible")) positionDishPreview(e);
    });
    target.addEventListener("mouseleave", hideDishPreview);
  }

  // Small camera badge shown next to a dish name once we've confirmed a
  // photo exists for it (resolveDishImage is cached, so this is instant for
  // names we've already checked this session).
  function makePhotoBadge(name) {
    // Space is reserved from the first paint (visibility, not display) so a
    // row's height never shifts once the async photo check resolves.
    var badge = el("span", { className: "photo-badge", text: "📷", attrs: { title: "Photo available on hover" } });
    resolveDishImage(name, function (url) { badge.classList.toggle("is-visible", !!url); });
    return badge;
  }

  // ---- recipes CRUD ----
  function findRecipe(id) { return state.recipes.find(function (r) { return r.id === id; }); }

  // Rebuilds the Recipes table body: one editable row per recipe (name,
  // carb/meat/repeatability selects, last-served date, delete button),
  // plus the empty-state note when there are no recipes at all.
  function renderRecipesTable() {
    recipesTbody.innerHTML = "";
    recipesEmptyNote.hidden = state.recipes.length > 0;

    state.recipes.forEach(function (r) {
      var row = el("tr");

      var nameInput = el("input", { attrs: { type: "text" } });
      nameInput.value = r.name;
      nameInput.addEventListener("change", function () { r.name = nameInput.value.trim(); saveState(); renderWeekTable(); renderHistory(); });
      attachDishHover(nameInput, r.name);

      var carbSelect = el("select"); fillSelect(carbSelect, CARB_CATEGORIES);
      carbSelect.value = r.carbCategory;
      carbSelect.addEventListener("change", function () { r.carbCategory = carbSelect.value; saveState(); renderHistory(); });

      var meatSelect = el("select"); fillSelect(meatSelect, MEAT_CATEGORIES);
      meatSelect.value = r.meatCategory;
      meatSelect.addEventListener("change", function () { r.meatCategory = meatSelect.value; saveState(); renderHistory(); });

      var repeatSelect = el("select"); fillSelect(repeatSelect, REPEAT_LEVELS);
      repeatSelect.value = r.repeatability;
      repeatSelect.addEventListener("change", function () { r.repeatability = repeatSelect.value; saveState(); });

      var last = lastServedDate(r.id);
      var lastCell = el("td", { text: last ? formatDate(toIso(last)) : "—" });

      var deleteBtn = el("button", { className: "icon-btn", text: "×", attrs: { type: "button", title: "Remove recipe" } });
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm("Remove \"" + r.name + "\"? Its past log entries are kept for history.")) return;
        state.recipes = state.recipes.filter(function (x) { return x.id !== r.id; });
        saveState();
        renderRecipesTable();
        renderWeekTable();
      });

      // Name cell holds the input + the photo badge side by side, inside a
      // plain <td> — the flex layout lives on the inner wrapper div, never
      // on the <td> itself (that would break the cell's table layout).
      var nameTd = el("td");
      var nameWrap = el("div", { className: "dish-name-cell" });
      nameWrap.appendChild(nameInput);
      nameWrap.appendChild(makePhotoBadge(r.name));
      nameTd.appendChild(nameWrap);
      row.appendChild(nameTd);
      [carbSelect, meatSelect, repeatSelect].forEach(function (input) {
        var td = el("td"); td.appendChild(input); row.appendChild(td);
      });
      row.appendChild(lastCell);
      var actionTd = el("td"); actionTd.appendChild(deleteBtn); row.appendChild(actionTd);
      recipesTbody.appendChild(row);
    });
  }

  // ---- add recipe (inline row) ----
  var addRecipeName = document.getElementById("add-recipe-name");
  var addRecipeCarb = document.getElementById("add-recipe-carb");
  var addRecipeMeat = document.getElementById("add-recipe-meat");
  var addRecipeRepeat = document.getElementById("add-recipe-repeat");
  fillSelect(addRecipeCarb, CARB_CATEGORIES);
  fillSelect(addRecipeMeat, MEAT_CATEGORIES);
  fillSelect(addRecipeRepeat, REPEAT_LEVELS);

  document.getElementById("add-recipe-btn").addEventListener("click", function () {
    var name = addRecipeName.value.trim();
    if (!name) { window.alert("Enter a dish name."); return; }
    state.recipes.push({
      id: makeId(),
      name: name,
      carbCategory: addRecipeCarb.value,
      meatCategory: addRecipeMeat.value,
      repeatability: addRecipeRepeat.value
    });
    saveState();
    addRecipeName.value = "";
    addRecipeCarb.value = CARB_CATEGORIES[0];
    addRecipeMeat.value = MEAT_CATEGORIES[0];
    addRecipeRepeat.value = REPEAT_LEVELS[0];
    renderRecipesTable();
  });

  // ---- bulk import recipes (merge by name, skip duplicates/unknown categories) ----
  var importRecipesFile = document.getElementById("import-recipes-file");
  document.getElementById("import-recipes-btn").addEventListener("click", function () { importRecipesFile.click(); });
  importRecipesFile.addEventListener("change", function () {
    var file = importRecipesFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = JSON.parse(reader.result);
        if (!Array.isArray(rows)) throw new Error("bad shape");

        var existingNames = state.recipes.map(function (r) { return r.name.trim().toLowerCase(); });
        var added = 0, skippedDup = 0, skippedInvalid = [];

        rows.forEach(function (row) {
          var name = (row.name || "").trim();
          var carb = CARB_CATEGORIES.find(function (c) { return c.toLowerCase() === (row.carbCategory || "").trim().toLowerCase(); });
          var meat = MEAT_CATEGORIES.find(function (c) { return c.toLowerCase() === (row.meatCategory || "").trim().toLowerCase(); });
          var repeat = REPEAT_LEVELS.find(function (c) { return c.toLowerCase() === (row.repeatability || "").trim().toLowerCase(); });

          if (!name || !carb || !meat || !repeat) { skippedInvalid.push(name || "(unnamed)"); return; }
          if (existingNames.indexOf(name.toLowerCase()) !== -1) { skippedDup++; return; }

          state.recipes.push({ id: makeId(), name: name, carbCategory: carb, meatCategory: meat, repeatability: repeat });
          existingNames.push(name.toLowerCase());
          added++;
        });

        saveState();
        renderRecipesTable();
        renderWeekTable();

        var msg = "Added " + added + " recipe" + (added === 1 ? "" : "s") + ".";
        if (skippedDup) msg += " Skipped " + skippedDup + " already in your list.";
        if (skippedInvalid.length) msg += " Couldn't read " + skippedInvalid.length + " row(s) (missing name or unrecognized category): " + skippedInvalid.join(", ") + ".";
        window.alert(msg);
      } catch (err) {
        window.alert("That file doesn't look like a valid recipe import.");
      }
      importRecipesFile.value = "";
    };
    reader.readAsText(file);
  });

  // ---- ratio breakdown text ----
  // Shows the current meat-ratio rounding live above the week table (e.g.
  // "Chicken 40% → 2.8 → 3"), independent of whether a week's been generated yet.
  function renderRatioBreakdown() {
    var result = buildMeatSlots(state.settings.meatRatios);
    var parts = result.breakdown.map(function (b) {
      return b.cat + " " + b.pct + "% → " + b.exact.toFixed(1) + " → " + b.count;
    });
    ratioBreakdownEl.textContent = "Meat ratio → dishes this week: " + parts.join(", ") + " (7 total).";
  }

  // ---- week table rendering ----
  var SPECIAL_LABELS = { order: "🥡 Order takeout", eatout: "🍽 Eat out" };

  function dayRepeatabilityLabel(day) {
    var r = day.recipeId ? findRecipe(day.recipeId) : null;
    return r ? r.repeatability : "—";
  }

  // Rebuilds the 7-day draft table. Each row shows the day/date, the dish
  // (or an Order/Eat-out label, or "unfilled"), its actual carb/meat
  // category (not the original generation target, so it stays accurate
  // after a manual override or reroll lands on something different), a
  // manual-pick dropdown, and a reroll button. Falls back to a single
  // placeholder row when there's no draft yet.
  function renderWeekTable() {
    weekTbody.innerHTML = "";
    if (!draft) {
      weekTbody.appendChild(el("tr", { html: '<td colspan="8" class="log-empty">Click "Generate next week" to build a draft menu.</td>' }));
      renderWarnings([]);
      updateConfirmState();
      return;
    }

    draft.days.forEach(function (day, i) {
      var row = el("tr");
      if (day.special) row.className = "is-special";
      else if (!day.recipeId) row.className = "is-unfilled";

      row.appendChild(el("td", { text: day.dayName }));
      row.appendChild(el("td", { text: formatDate(day.date) }));

      var recipe = day.recipeId ? findRecipe(day.recipeId) : null;
      if (day.special) {
        row.appendChild(el("td", { text: SPECIAL_LABELS[day.special] }));
        row.appendChild(el("td", { text: "—" }));
        row.appendChild(el("td", { text: "—" }));
      } else {
        var dishCell = el("td");
        if (recipe) {
          var dishWrap = el("div", { className: "dish-name-cell" });
          dishWrap.appendChild(el("span", { text: recipe.name }));
          dishWrap.appendChild(makePhotoBadge(recipe.name));
          dishCell.appendChild(dishWrap);
          attachDishHover(dishCell, recipe.name);
        } else {
          dishCell.textContent = "— unfilled —";
        }
        row.appendChild(dishCell);
        row.appendChild(el("td", { text: recipe ? recipe.carbCategory : day.carb + " (target)" }));
        row.appendChild(el("td", { text: recipe ? recipe.meatCategory : day.meat + " (target)" }));
      }
      row.appendChild(el("td", { text: dayRepeatabilityLabel(day) }));

      // Manual override dropdown — always available, not just when a day
      // has a warning. "Order"/"Eat out" sit above the recipe list.
      var pickSelect = el("select", { className: "day-select" });
      pickSelect.appendChild(el("option", { text: "— unfilled —", attrs: { value: "" } }));
      pickSelect.appendChild(el("option", { text: SPECIAL_LABELS.order, attrs: { value: "__order__" } }));
      pickSelect.appendChild(el("option", { text: SPECIAL_LABELS.eatout, attrs: { value: "__eatout__" } }));
      state.recipes.forEach(function (r) {
        var option = el("option", {
          text: r.name + " (" + r.carbCategory + " / " + r.meatCategory + ", " + r.repeatability + ")",
          attrs: { value: r.id }
        });
        pickSelect.appendChild(option);
        resolveDishImage(r.name, function (url) { if (url) option.textContent = "📷 " + option.textContent; });
      });
      pickSelect.value = day.special ? "__" + day.special + "__" : (day.recipeId || "");
      pickSelect.addEventListener("change", function () {
        var v = pickSelect.value;
        if (v === "__order__") { day.special = "order"; day.recipeId = null; }
        else if (v === "__eatout__") { day.special = "eatout"; day.recipeId = null; }
        else { day.special = null; day.recipeId = v || null; }
        renderWeekTable();
      });
      var pickTd = el("td"); pickTd.appendChild(pickSelect); row.appendChild(pickTd);

      var rerollBtn = el("button", { className: "icon-btn", text: "⟳", attrs: { type: "button", title: "Reroll this day" } });
      rerollBtn.addEventListener("click", function () { rerollDay(i); });
      var rerollTd = el("td"); rerollTd.appendChild(rerollBtn); row.appendChild(rerollTd);

      weekTbody.appendChild(row);
    });

    renderWarnings(draft.warnings);
    updateConfirmState();
  }

  // Shows/hides the warnings list above the table (fallback tiers used,
  // unfilled days, quota/ratio mismatches).
  function renderWarnings(warnings) {
    warningListEl.innerHTML = "";
    if (!warnings || warnings.length === 0) { warningListEl.hidden = true; return; }
    warningListEl.hidden = false;
    warnings.forEach(function (w) { warningListEl.appendChild(el("li", { text: w })); });
  }

  // Confirm & Log is only enabled once every day has either a dish or an
  // Order/Eat-out marker — never with a day left blank.
  function updateConfirmState() {
    var ready = draft && draft.days.every(function (d) { return !!d.recipeId || !!d.special; });
    confirmBtn.disabled = !ready;
    confirmBtn.title = ready ? "" : "Every day needs a dish (or Order/Eat out) before you can log this week.";
  }

  // ---- reroll a single day, keeping its carb/meat target ----
  // Reroll deliberately ignores carb quotas, meat ratios, cooldowns, and
  // weights — it's a "just give me something else" button, not a mini
  // generation pass. It only guarantees the pick differs from what's
  // currently sitting in this slot (when more than one recipe exists).
  function rerollDay(index) {
    if (!draft) return;
    var day = draft.days[index];
    var currentId = day.recipeId;

    var pool = state.recipes.filter(function (r) { return r.id !== currentId; });
    if (pool.length === 0) pool = state.recipes.slice();

    draft.warnings = draft.warnings.filter(function (w) { return w.indexOf(day.dayName + ":") !== 0; });

    if (pool.length === 0) {
      day.recipeId = null;
      draft.warnings.push(day.dayName + ": no recipes to reroll to — add some in the Recipes section.");
    } else {
      day.recipeId = pool[Math.floor(Math.random() * pool.length)].id;
      day.special = null;
    }
    renderWeekTable();
  }

  // ---- generate / confirm ----
  function randomSeed() { return Math.floor(Math.random() * 1e9); }
  seedInput.value = randomSeed();

  document.getElementById("randomize-seed-btn").addEventListener("click", function () {
    seedInput.value = randomSeed();
  });

  // Builds a fresh draft using whatever seed is currently in the seed
  // field (filling in a random one if it's blank/invalid), replacing any
  // existing unconfirmed draft.
  document.getElementById("generate-btn").addEventListener("click", function () {
    if (state.recipes.length === 0) {
      window.alert("Add at least one recipe first.");
      return;
    }
    var seed = parseInt(seedInput.value, 10);
    if (!Number.isFinite(seed)) { seed = randomSeed(); seedInput.value = seed; }
    draft = generateWeek(seed);
    renderWeekTable();
  });

  // Writes the finalized week into the log (only on explicit confirm, never
  // on generate/reroll, so rejected drafts don't pollute history), then
  // locks the button until a new draft is generated.
  confirmBtn.addEventListener("click", function () {
    if (!draft) return;
    draft.days.forEach(function (day) {
      if (!day.recipeId && !day.special) return;
      state.log.push({
        id: makeId(),
        recipeId: day.recipeId || null,
        special: day.special || null,
        dateServed: day.date,
        weekStart: draft.weekStart,
        seed: draft.seed
      });
    });
    saveState();
    renderRecipesTable();
    renderHistory();
    window.alert("Week logged.");
    confirmBtn.disabled = true;
    confirmBtn.title = "This week is already logged. Generate a new draft to log again.";
  });

  // ---- history ----
  var historyFrom = document.getElementById("history-from");
  var historyTo = document.getElementById("history-to");
  document.getElementById("history-clear-btn").addEventListener("click", function () {
    historyFrom.value = ""; historyTo.value = ""; renderHistory();
  });
  historyFrom.addEventListener("change", renderHistory);
  historyTo.addEventListener("change", renderHistory);

  // Renders every logged week (within the optional From/To date filter) as
  // its own mini table, most recent week first, each day sorted oldest-first
  // within that week.
  function renderHistory() {
    historyListEl.innerHTML = "";
    var weeks = {};
    state.log.forEach(function (e) {
      if (historyFrom.value && e.dateServed < historyFrom.value) return;
      if (historyTo.value && e.dateServed > historyTo.value) return;
      (weeks[e.weekStart] = weeks[e.weekStart] || []).push(e);
    });
    var weekStarts = Object.keys(weeks).sort().reverse();

    if (weekStarts.length === 0) {
      historyListEl.appendChild(el("p", { className: "log-empty", text: "No logged weeks yet." }));
      return;
    }

    weekStarts.forEach(function (ws) {
      var entries = weeks[ws].slice().sort(function (a, b) { return a.dateServed < b.dateServed ? -1 : 1; });
      var wrap = el("div", { className: "table-scroll", attrs: {} });
      var heading = el("h4", { text: "Week of " + formatDate(ws) });
      heading.style.marginTop = "20px";
      historyListEl.appendChild(heading);

      var table = el("table", { className: "diary-table" });
      var thead = el("thead", { html: "<tr><th>Date</th><th>Dish</th><th>Carb</th><th>Meat</th></tr>" });
      var tbody = el("tbody");
      entries.forEach(function (e) {
        var r = e.recipeId ? findRecipe(e.recipeId) : null;
        var row = el("tr");
        row.appendChild(el("td", { text: formatDate(e.dateServed) }));
        if (e.special) {
          row.appendChild(el("td", { text: SPECIAL_LABELS[e.special] || e.special }));
          row.appendChild(el("td", { text: "—" }));
          row.appendChild(el("td", { text: "—" }));
        } else {
          var histDishCell = el("td");
          if (r) {
            var histDishWrap = el("div", { className: "dish-name-cell" });
            histDishWrap.appendChild(el("span", { text: r.name }));
            histDishWrap.appendChild(makePhotoBadge(r.name));
            histDishCell.appendChild(histDishWrap);
            attachDishHover(histDishCell, r.name);
          } else {
            histDishCell.textContent = "(deleted recipe)";
          }
          row.appendChild(histDishCell);
          row.appendChild(el("td", { text: r ? r.carbCategory : "—" }));
          row.appendChild(el("td", { text: r ? r.meatCategory : "—" }));
        }
        tbody.appendChild(row);
      });
      table.appendChild(thead); table.appendChild(tbody);
      wrap.appendChild(table);
      historyListEl.appendChild(wrap);
    });
  }

  // ---- settings modal ----
  var modal = document.getElementById("settings-modal");
  var carbGrid = document.getElementById("carb-quota-grid");
  var meatGrid = document.getElementById("meat-ratio-grid");
  var weightGrid = document.getElementById("weight-grid");
  var lookbackInput = document.getElementById("lookback-input");
  var maxNewInput = document.getElementById("max-new-input");
  var carbBadge = document.getElementById("carb-sum-badge");
  var meatBadge = document.getElementById("meat-sum-badge");

  // Working copy of settings edited in the modal — only written back to
  // state.settings when Save is clicked, so Cancel/close-without-saving
  // (and Reset, before Save) never mutate the live settings.
  var draftSettings = null;

  // Builds one label+number-input pair for the settings grids, wiring its
  // input event to both update draftSettings and refresh the validation badges.
  function buildSettingsField(container, key, value, onInput) {
    var field = el("div", { className: "form-field" });
    field.appendChild(el("label", { text: key }));
    var input = el("input", { attrs: { type: "number" } });
    input.value = value;
    input.addEventListener("input", function () {
      onInput(parseFloat(input.value) || 0);
      updateValidationBadges();
    });
    field.appendChild(input);
    container.appendChild(field);
  }

  // Clones the given settings into draftSettings and rebuilds every field
  // in the modal from it — used both when opening the modal (from
  // state.settings) and when clicking Reset (from defaultSettings()).
  function populateSettingsForm(settings) {
    draftSettings = JSON.parse(JSON.stringify(settings));

    carbGrid.innerHTML = "";
    CARB_CATEGORIES.forEach(function (cat) {
      buildSettingsField(carbGrid, cat, draftSettings.carbQuotas[cat], function (v) { draftSettings.carbQuotas[cat] = v; });
    });

    meatGrid.innerHTML = "";
    MEAT_CATEGORIES.forEach(function (cat) {
      buildSettingsField(meatGrid, cat, draftSettings.meatRatios[cat], function (v) { draftSettings.meatRatios[cat] = v; });
    });

    weightGrid.innerHTML = "";
    REPEAT_LEVELS.forEach(function (level) {
      buildSettingsField(weightGrid, level, draftSettings.weights[level], function (v) { draftSettings.weights[level] = v; });
    });

    lookbackInput.value = draftSettings.lookbackDays;
    maxNewInput.value = draftSettings.maxNewPerWeek;
    updateValidationBadges();
  }

  // Live "X / 7" and "X / 100%" badges on the carb quota / meat ratio
  // sections — flags an invalid total without blocking Save, since
  // generateWeek() already copes gracefully with either being off.
  function updateValidationBadges() {
    var carbSum = CARB_CATEGORIES.reduce(function (s, c) { return s + (draftSettings.carbQuotas[c] || 0); }, 0);
    var meatSum = MEAT_CATEGORIES.reduce(function (s, c) { return s + (draftSettings.meatRatios[c] || 0); }, 0);
    carbBadge.textContent = carbSum + " / 7";
    carbBadge.className = "validation-badge " + (carbSum === 7 ? "is-valid" : "is-invalid");
    meatBadge.textContent = meatSum + " / 100%";
    meatBadge.className = "validation-badge " + (meatSum === 100 ? "is-valid" : "is-invalid");
  }

  document.getElementById("settings-btn").addEventListener("click", function () {
    populateSettingsForm(state.settings);
    modal.hidden = false;
  });
  document.getElementById("settings-close-btn").addEventListener("click", function () { modal.hidden = true; });
  // Clicking the dimmed backdrop (not the card itself) also closes the modal.
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });

  document.getElementById("settings-reset-btn").addEventListener("click", function () {
    populateSettingsForm(defaultSettings());
  });

  document.getElementById("settings-save-btn").addEventListener("click", function () {
    draftSettings.lookbackDays = Math.max(1, parseInt(lookbackInput.value, 10) || defaultSettings().lookbackDays);
    draftSettings.maxNewPerWeek = Math.max(0, parseInt(maxNewInput.value, 10) || 0);
    state.settings = draftSettings;
    saveState();
    renderRatioBreakdown();
    modal.hidden = true;
  });

  // ---- init ----
  // Re-renders every view (items table, ratio breakdown, week table,
  // history) — called on first load and again after cloud sync adopts a
  // newer remote copy.
  function renderAllViews() {
    renderRecipesTable();
    renderRatioBreakdown();
    renderWeekTable();
    renderHistory();
  }
  renderAllViews();
  initialSync();
})();
