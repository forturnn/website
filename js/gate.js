/* Simple client-side password gate. Not real security — just keeps the
   site out of casual view until it's ready to go public. */
(function () {
  var STORAGE_KEY = "site_auth";
  var PASSWORD_HASH = "9e68ae360e4f5833da1cb93ab5b96f76e79e696ee7b5c6409d6db865d3a273ae";

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    document.documentElement.classList.remove("gate-locked");
  }

  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    });
  }

  function showSite() {
    document.documentElement.classList.remove("gate-locked");
    var gate = document.getElementById("site-gate");
    if (gate) gate.remove();
  }

  function buildGate() {
    var overlay = document.createElement("div");
    overlay.id = "site-gate";
    overlay.innerHTML =
      '<form id="site-gate-form" class="site-gate-card">' +
      '<p class="site-gate-eyebrow">Private preview</p>' +
      '<h1 class="site-gate-title">This site isn’t public yet</h1>' +
      '<p class="site-gate-sub">Enter the password to continue.</p>' +
      '<input type="password" id="site-gate-input" class="site-gate-input" placeholder="Password" autocomplete="off" autofocus>' +
      '<button type="submit" class="site-gate-btn">Enter</button>' +
      '<p id="site-gate-error" class="site-gate-error"></p>' +
      "</form>";
    document.body.appendChild(overlay);

    var form = document.getElementById("site-gate-form");
    var input = document.getElementById("site-gate-input");
    var error = document.getElementById("site-gate-error");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sha256(input.value).then(function (hash) {
        if (hash === PASSWORD_HASH) {
          localStorage.setItem(STORAGE_KEY, "1");
          showSite();
        } else {
          error.textContent = "Incorrect password.";
          input.value = "";
          input.focus();
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.documentElement.classList.contains("gate-locked")) {
      buildGate();
    }
  });
})();
