(() => {
  "use strict";

  const SECRET_KEY_RE = /(?:private[\s_-]*key|seed[\s_-]*phrase|mnemonic|recovery[\s_-]*phrase|passphrase|passkey|wallet[\s_-]*secret|\bsecret\b)/i;
  const PRIVATE_KEY_VALUE_RE = /^\s*(?:0x)?[a-f0-9]{64}\s*$/i;

  function looksLikeMnemonic(value) {
    const words = String(value || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return [12, 15, 18, 21, 24].includes(words.length) && words.every((word) => /^[a-z]+$/.test(word));
  }

  function scrubStorage(storage) {
    try {
      if (!storage) return;
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
      for (const key of keys) {
        const value = storage.getItem(key) || "";
        if (SECRET_KEY_RE.test(key) || PRIVATE_KEY_VALUE_RE.test(value) || looksLikeMnemonic(value)) {
          storage.removeItem(key);
        }
      }
    } catch {}
  }

  function hardenInputs() {
    document.querySelectorAll("input, textarea").forEach((field) => {
      field.setAttribute("autocomplete", "off");
      field.setAttribute("autocapitalize", "off");
      field.setAttribute("spellcheck", "false");
    });
  }

  function safeScrubStorage(name) {
    try {
      scrubStorage(window[name]);
    } catch {}
  }

  safeScrubStorage("localStorage");
  safeScrubStorage("sessionStorage");
  window.addEventListener("storage", () => {
    safeScrubStorage("localStorage");
    safeScrubStorage("sessionStorage");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hardenInputs, { once: true });
  } else {
    hardenInputs();
  }
})();
