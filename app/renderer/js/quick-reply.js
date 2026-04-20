// Quick reply button and quote sanitization script for Zulip Desktop
// This script is injected into webviews to add:
// 1. Quick reply button (↩) next to each message
// 2. Quote sanitization - keeps only the top-level quote when replying

(function () {
  "use strict";

  // === Quick Reply Button ===
  function addReplyButtons() {
    document.querySelectorAll('.message_row').forEach(row => {
      if (row.querySelector('.my-inline-reply')) return;

      const controls = row.querySelector('.message_controls');
      if (!controls) return;

      const btn = document.createElement('div');
      btn.className = 'my-inline-reply message_control_button';
      btn.innerHTML = '↩';
      btn.title = 'Quick reply';

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        quickReply(row);
      });

      controls.prepend(btn);
    });
  }

  function quickReply(row) {
    const actionsBtn = row.querySelector('.message-actions-menu-button');
    if (!actionsBtn) return;

    actionsBtn.click();

    setTimeout(() => {
      const replyBtn = document.querySelector('.respond_button');
      replyBtn?.click();
    }, 30);
  }

  const observer = new MutationObserver(() => {
    addReplyButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  addReplyButtons();

  // Add styles for reply button
  const style = document.createElement('style');
  style.textContent = `
    .my-inline-reply {
      cursor: pointer;
      padding: 0 6px;
    }
  `;
  document.head.appendChild(style);

  // === Quote Sanitization (keep only top-level quote) ===
  const PENDING_WINDOW_MS = 8000;
  const RETRY_DELAY_MS = 120;
  const MAX_RETRIES = 40;

  let pendingQuoteUntil = 0;
  let retryTimer = null;
  let isApplyingSanitize = false;

  function looksLikeQuoteAttribution(line) {
    const trimmed = line.trim();
    return /:\s*$/.test(trimmed) && /\[[^\]]+\]\([^)]*\)/.test(trimmed);
  }

  function removeNestedQuoteSections(markdown) {
    const lines = markdown.split("\n");
    const out = [];

    let i = 0;
    while (i < lines.length) {
      const opener = lines[i].trim().match(/^(`{3,}|~{3,})\s*quote\s*$/i);
      if (!opener) {
        out.push(lines[i]);
        i += 1;
        continue;
      }

      while (out.length > 0 && out[out.length - 1].trim() === "") {
        out.pop();
      }
      if (out.length > 0 && looksLikeQuoteAttribution(out[out.length - 1])) {
        out.pop();
      }

      const openerFence = opener[1];
      const fenceChar = openerFence[0];
      const minLen = openerFence.length;
      const closerRe = new RegExp(`^${fenceChar}{${minLen},}\\s*$`);

      i += 1;
      while (i < lines.length) {
        if (closerRe.test(lines[i].trim())) {
          i += 1;
          break;
        }
        i += 1;
      }

      while (i < lines.length && lines[i].trim() === "") {
        i += 1;
      }
    }

    return out.join("\n");
  }

  function stripExistingQuotes(markdown) {
    let text = markdown.replace(/\r\n/g, "\n");
    let prev;
    do {
      prev = text;
      text = removeNestedQuoteSections(text);
    } while (text !== prev);

    return text.trim();
  }

  function sanitizeTopLevelQuoteBlocks(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const result = [];

    let i = 0;
    while (i < lines.length) {
      const openerMatch = lines[i].trim().match(/^(`{3,}|~{3,})\s*quote\s*$/i);
      if (!openerMatch) {
        // Replace zulip user links @_**Name|ID** with @**Name**
        const replacedLine = lines[i].replace(/@_\*\*([^\|]+)\|(\d+)\*\*/g, '@**$1**');
        result.push(replacedLine);
        i += 1;
        continue;
      }

      const openerLine = lines[i];
      const openerFence = openerMatch[1];
      const fenceChar = openerFence[0];
      const minLen = openerFence.length;
      const closerRe = new RegExp(`^${fenceChar}{${minLen},}\\s*$`);

      i += 1;
      const inner = [];
      while (i < lines.length && !closerRe.test(lines[i].trim())) {
        inner.push(lines[i]);
        i += 1;
      }

      const closerLine = i < lines.length ? lines[i] : openerFence;
      const cleanedInner = stripExistingQuotes(inner.join("\n"));

      result.push(openerLine);
      if (cleanedInner.length > 0) {
        result.push(...cleanedInner.split("\n"));
      }
      result.push(closerLine);

      if (i < lines.length) {
        i += 1;
      }
    }

    return result.join("\n");
  }

  function getTargetTextarea() {
    return document.querySelector("textarea#compose-textarea");
  }

  function shouldAttemptSanitize() {
    return Date.now() <= pendingQuoteUntil;
  }

  function countQuoteFenceOpeners(text) {
    const matches = text.match(/^(`{3,}|~{3,})\s*quote\s*$/gim);
    return matches ? matches.length : 0;
  }

  function doSanitizeIfNeeded() {
    if (!shouldAttemptSanitize()) {
      return true;
    }

    const textarea = getTargetTextarea();
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return false;
    }

    const current = textarea.value;
    if (!/(`{3,}|~{3,})\s*quote\s*\n/i.test(current)) {
      return false;
    }

    const cleaned = sanitizeTopLevelQuoteBlocks(current);
    if (cleaned !== current) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      isApplyingSanitize = true;
      textarea.value = cleaned;
      textarea.dispatchEvent(new Event("input", {bubbles: true}));
      try {
        textarea.setSelectionRange(Math.min(start, cleaned.length), Math.min(end, cleaned.length));
      } catch (_e) {
        // Ignore cursor restore failures.
      }
      isApplyingSanitize = false;
    }

    pendingQuoteUntil = 0;
    return true;
  }

  function scheduleSanitizeRetries() {
    if (retryTimer !== null) {
      return;
    }

    let retries = 0;
    retryTimer = window.setInterval(() => {
      retries += 1;
      const done = doSanitizeIfNeeded();
      if (done || retries >= MAX_RETRIES || !shouldAttemptSanitize()) {
        if (retryTimer !== null) {
          clearInterval(retryTimer);
        }
        retryTimer = null;
      }
    }, RETRY_DELAY_MS);
  }

  function sanitizeFromTextareaInput(textarea) {
    if (isApplyingSanitize) {
      return;
    }

    const current = textarea.value;
    if (!/(`{3,}|~{3,})\s*quote\s*\n/i.test(current)) {
      return;
    }

    if (countQuoteFenceOpeners(current) < 2) {
      return;
    }

    const cleaned = sanitizeTopLevelQuoteBlocks(current);
    if (cleaned === current) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    isApplyingSanitize = true;
    textarea.value = cleaned;
    textarea.dispatchEvent(new Event("input", {bubbles: true}));
    try {
      textarea.setSelectionRange(Math.min(start, cleaned.length), Math.min(end, cleaned.length));
    } catch (_e) {
      // Ignore cursor restore failures.
    }
    isApplyingSanitize = false;
  }

  function markQuoteTriggered() {
    pendingQuoteUntil = Date.now() + PENDING_WINDOW_MS;
    scheduleSanitizeRetries();
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".respond_button")) {
        markQuoteTriggered();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (
        event.key === ">" ||
        (event.shiftKey && (event.code === "Period" || event.code === "NumpadDecimal"))
      ) {
        markQuoteTriggered();
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (target.id !== "compose-textarea") {
        return;
      }
      sanitizeFromTextareaInput(target);
    },
    true,
  );
})();
