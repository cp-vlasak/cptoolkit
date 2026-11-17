/**
 * Facebook Feed Generator (on-demand tool)
 *
 * Builds the code for a Facebook Page feed (iframe + centring style + resize script)
 * and copies it to the clipboard, ready to paste into a Custom HTML widget.
 *
 * Plan and decisions: docs/facebook-feed-generator-plan.md
 * The resize script is a copy of CPGV2026/code/js/facebook_resize_enhanced.html.
 * If that script changes, update buildResizeScript() below to match.
 */
(function () {
  "use strict";

  var TEST_HOOK = window.__CP_FB_FEED_TEST__ || null;

  var LIMITS = { minWidth: 220, maxWidth: 500, minHeight: 350, maxHeight: 1000 };
  var DEFAULTS = { width: 500, height: 520 };
  var PLUGIN_URL = "https://www.facebook.com/plugins/page.php";
  var ALLOWED_HOSTS = ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"];

  // ==================== CODE BUILDER (pure, no page access) ====================

  /** Verbatim copy of the resize script, with the four size limits filled in. Keep the lines at column 0. */
    function buildResizeScript(minWidth, maxWidth, minHeight, maxHeight) {
    return `<script>
  (function () {
    var selector = '.facebook-container';
    var minWidth = ${minWidth};
    var maxWidth = ${maxWidth};
    var minHeight = ${minHeight};
    var maxHeight = ${maxHeight};
    var aspectRatio = 1.4;

    function clamp(num, min, max) {
      return Math.min(Math.max(num, min), max);
    }

    function getContainers() {
      return document.querySelectorAll(selector);
    }

    function getVisibleWidth(el) {
      if (!el) return 0;
      var rect = el.getBoundingClientRect();
      return Math.round(rect.width || 0);
    }

    function adjustOne(container) {
      var iframe = container.querySelector('iframe');
      if (!iframe) return;

      var containerWidth = getVisibleWidth(container);
      if (!containerWidth) return;

      var width = clamp(containerWidth, minWidth, maxWidth);
      var height = clamp(Math.floor(width * aspectRatio), minHeight, maxHeight);

      /*
       * Avoid reloading the Facebook iframe when these exact dimensions
       * have already been applied.
       */
      if (
        iframe.dataset.appliedWidth === String(width) &&
        iframe.dataset.appliedHeight === String(height)
      ) {
        return;
      }

      if (!iframe.dataset.baseSrc) {
        iframe.dataset.baseSrc = iframe.getAttribute('src') || '';
      }

      if (!iframe.dataset.baseSrc) return;

      var url;

      try {
        url = new URL(iframe.dataset.baseSrc, window.location.href);
      } catch (e) {
        console.warn('Facebook iframe src is not a valid URL:', e);
        return;
      }

      url.searchParams.set('width', width);
      url.searchParams.set('height', height);

      /*
       * Record these before changing the iframe. This prevents observers
       * triggered by the change from reloading it again.
       */
      iframe.dataset.appliedWidth = String(width);
      iframe.dataset.appliedHeight = String(height);

      iframe.style.width = width + 'px';
      iframe.style.height = height + 'px';
      iframe.style.display = 'block';
      iframe.style.margin = '0 auto';

      iframe.setAttribute('width', width);
      iframe.setAttribute('height', height);
      iframe.setAttribute('src', url.toString());
    }

    function adjustAll() {
      var containers = getContainers();
      for (var i = 0; i < containers.length; i++) {
        adjustOne(containers[i]);
      }
    }

    var scheduled = false;
    function scheduleAdjust() {
      if (scheduled) return;
      scheduled = true;

      setTimeout(function () {
        requestAnimationFrame(function () {
          scheduled = false;
          adjustAll();
        });
      }, 150);
    }

    function isTabTrigger(node) {
      if (!node || !node.closest) return false;
      return !!node.closest('.cpTabs a, .tabButton[role="tab"]');
    }

    document.addEventListener('click', function (e) {
      if (isTabTrigger(e.target)) {
        scheduleAdjust();
      }
    }, true);

    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && isTabTrigger(e.target)) {
        scheduleAdjust();
      }
    }, true);

    window.addEventListener('resize', scheduleAdjust);
    window.addEventListener('orientationchange', scheduleAdjust);
    window.addEventListener('pageshow', scheduleAdjust);
    window.addEventListener('load', scheduleAdjust);

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        scheduleAdjust();
      });

      var observed = false;

      function observeContainers() {
        var containers = getContainers();
        for (var i = 0; i < containers.length; i++) {
          ro.observe(containers[i]);
          observed = true;
        }
      }

      observeContainers();

      if (!observed) {
        setTimeout(observeContainers, 300);
        setTimeout(observeContainers, 1000);
      }
    }

    if (window.MutationObserver) {
      var mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (
            m.type === 'attributes' &&
            (m.attributeName === 'class' ||
              m.attributeName === 'style' ||
              m.attributeName === 'aria-selected' ||
              m.attributeName === 'hidden')
          ) {
            scheduleAdjust();
            return;
          }
        }
      });

      mo.observe(document.body, {
        subtree: true,
        attributes: true
      });
    }

    if (window.Pages && window.Pages.angularToolbarComplete && window.jQuery) {
      window.jQuery.when(window.Pages.angularToolbarComplete).done(scheduleAdjust);
    }

    scheduleAdjust();
  })();
</script>`;
  }

  var STYLE_BLOCK =
    "<style>\n" +
    '  [class^="facebook-container"] {\n' +
    "    text-align: center;\n" +
    "  }\n" +
    "</style>";

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Accepts a Facebook Page link (or a pasted plugin src) and returns { ok, href } or { ok:false, error }. */
  function parseFacebookLink(input, depth) {
    var text = String(input == null ? "" : input).trim();
    if (!text) return { ok: false, error: "Paste the link to the Facebook Page." };
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(text)) text = "https://" + text;

    var url;
    try {
      url = new URL(text);
    } catch (e) {
      return { ok: false, error: "That does not look like a valid link." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: "The link must start with https://" };
    }
    if (ALLOWED_HOSTS.indexOf(url.hostname.toLowerCase()) === -1) {
      return { ok: false, error: "The link must be a facebook.com Page address." };
    }

    var path = url.pathname.replace(/\/+$/, "");

    // A pasted plugin src: use the page link inside its href parameter.
    if (/^\/plugins\//i.test(path)) {
      var inner = url.searchParams.get("href");
      if (inner && !depth) return parseFacebookLink(inner, 1);
      return { ok: false, error: "Paste the Facebook Page link, for example https://www.facebook.com/YourPageName" };
    }

    if (/^\/profile\.php$/i.test(path)) {
      var id = url.searchParams.get("id") || "";
      if (!/^\d+$/.test(id)) return { ok: false, error: "That profile link is missing its id number." };
      return { ok: true, href: "https://www.facebook.com/profile.php?id=" + id };
    }

    if (!path) {
      return { ok: false, error: "Add the Page name to the link, for example https://www.facebook.com/YourPageName" };
    }
    return { ok: true, href: "https://www.facebook.com" + path };
  }

  function readSize(value, min, max, label) {
    var text = String(value == null ? "" : value).trim();
    var n = /^\d+$/.test(text) ? parseInt(text, 10) : NaN;
    if (isNaN(n) || n < min || n > max) {
      return { ok: false, error: label + " must be a whole number from " + min + " to " + max + "." };
    }
    return { ok: true, value: n };
  }

  /**
   * options: { link, width, height, showPosts, timeline, title }
   * Returns { ok:true, code } or { ok:false, field, error }.
   */
  function buildFacebookFeedCode(options) {
    options = options || {};
    var link = parseFacebookLink(options.link);
    if (!link.ok) return { ok: false, field: "link", error: link.error };

    var width = readSize(options.width, LIMITS.minWidth, LIMITS.maxWidth, "Width");
    if (!width.ok) return { ok: false, field: "width", error: width.error };

    var height = readSize(options.height, LIMITS.minHeight, LIMITS.maxHeight, "Height");
    if (!height.ok) return { ok: false, field: "height", error: height.error };

    // The iframe title is what screen readers announce (WCAG), so it is required.
    var title = String(options.title == null ? "" : options.title).replace(/\s+/g, " ").trim();
    if (!title) {
      return { ok: false, field: "title", error: "Enter a feed title. Screen readers read it aloud, so every Facebook feed needs one." };
    }

    var src = new URL(PLUGIN_URL);
    src.searchParams.set("href", link.href);
    if (options.timeline) src.searchParams.set("tabs", "timeline");
    if (options.showPosts) src.searchParams.set("show_posts", "true");
    src.searchParams.set("width", String(width.value));
    src.searchParams.set("height", String(height.value));
    src.searchParams.set("small_header", "false");
    src.searchParams.set("adapt_container_width", "true");
    src.searchParams.set("hide_cover", "false");
    src.searchParams.set("show_facepile", "true");
    // Facebook's own embed ends with a bare "appId" (no value); the working reference does too.
    var srcText = src.toString() + "&appId";

    var iframe =
      '<iframe src="' + srcText + '" title="' + escapeAttr(title) + '" width="' + width.value +
      '" height="' + height.value + '" style="border:none;overflow:hidden" scrolling="no" frameborder="0"' +
      ' allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';

    var code =
      '<div class="facebook-container">\n' + iframe + "\n</div>\n\n" +
      STYLE_BLOCK + "\n\n" +
      buildResizeScript(LIMITS.minWidth, width.value, 350, height.value);

    return { ok: true, code: code };
  }

  if (TEST_HOOK) {
    TEST_HOOK.exports = {
      parseFacebookLink: parseFacebookLink,
      buildFacebookFeedCode: buildFacebookFeedCode,
      LIMITS: LIMITS,
      DEFAULTS: DEFAULTS
    };
    if (TEST_HOOK.noUI) return;
  }

  // ==================== DIALOG ====================

  function ensureStyles() {
    if (document.getElementById("cp-fb-style")) return;
    var style = document.createElement("style");
    style.id = "cp-fb-style";
    style.textContent =
      ".cp-fb-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:20px;}" +
      ".cp-fb-modal{background:#fff;color:#222;max-width:620px;width:100%;max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:12px;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,0.4);padding:20px;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}" +
      ".cp-fb-modal h2{margin:0;font-size:20px;}" +
      ".cp-fb-modal p{margin:0;font-size:14px;line-height:1.4;}" +
      ".cp-fb-field{display:flex;flex-direction:column;gap:6px;font-size:14px;}" +
      ".cp-fb-field>span:first-child{font-weight:bold;}" +
      ".cp-fb-field input[type=text],.cp-fb-field input[type=number],.cp-fb-code{border:1px solid #c7c7c7;border-radius:4px;padding:6px;font-size:14px;font-family:inherit;box-sizing:border-box;width:100%;}" +
      ".cp-fb-sizes{display:flex;gap:16px;}" +
      ".cp-fb-sizes .cp-fb-field{flex:1;}" +
      ".cp-fb-hint{font-size:12px;color:#555;}" +
      ".cp-fb-check{display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.4;cursor:pointer;}" +
      ".cp-fb-check input{margin-top:3px;}" +
      ".cp-fb-checks{display:flex;flex-direction:column;gap:10px;}" +
      ".cp-fb-note{font-size:13px;color:#7a4b00;background:#fff4dc;border:1px solid #f0d9a8;border-radius:4px;padding:8px;}" +
      ".cp-fb-error{font-size:13px;color:#b00020;min-height:1em;}" +
      ".cp-fb-result{display:none;flex-direction:column;gap:6px;}" +
      ".cp-fb-code{height:130px;font-family:Consolas,Menlo,monospace;font-size:12px;resize:vertical;}" +
      ".cp-fb-status{font-size:13px;}" +
      ".cp-fb-status.ok{color:#1b6e2f;}" +
      ".cp-fb-status.warn{color:#7a4b00;}" +
      ".cp-fb-actions{display:flex;justify-content:flex-end;gap:8px;}" +
      ".cp-fb-actions button{padding:8px 16px;font-size:14px;font-family:inherit;border-radius:4px;border:none;cursor:pointer;}" +
      ".cp-fb-actions button.primary{background:#af282f;color:#fff;}" +
      ".cp-fb-actions button.secondary{background:#f2f2f2;color:#333;}";
    document.head.appendChild(style);
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      function fallback() {
        try {
          var area = document.createElement("textarea");
          area.value = text;
          area.setAttribute("readonly", "");
          area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
          document.body.appendChild(area);
          area.select();
          var done = document.execCommand("copy");
          area.remove();
          finish(!!done);
        } catch (e) {
          finish(false);
        }
      }
      // If the browser never answers (for example a pending permission prompt), stop waiting.
      setTimeout(function () { finish(false); }, 2000);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { finish(true); }, fallback);
      } else {
        fallback();
      }
    });
  }

  function openDialog() {
    var old = document.getElementById("cp-fb-overlay");
    if (old) old.remove();
    ensureStyles();

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function field(labelText, input, hint) {
      var wrap = el("label", "cp-fb-field");
      wrap.appendChild(el("span", "", labelText));
      wrap.appendChild(input);
      if (hint) wrap.appendChild(el("span", "cp-fb-hint", hint));
      return wrap;
    }

    function textInput(type, value, placeholder) {
      var input = document.createElement("input");
      input.type = type;
      if (value != null) input.value = value;
      if (placeholder) input.placeholder = placeholder;
      return input;
    }

    function checkbox(labelText, hint, checked) {
      var row = el("label", "cp-fb-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      var text = el("span", "");
      text.appendChild(document.createTextNode(labelText + " "));
      text.appendChild(el("span", "cp-fb-hint", hint));
      row.appendChild(input);
      row.appendChild(text);
      return { row: row, input: input };
    }

    var overlay = el("div", "cp-fb-overlay");
    overlay.id = "cp-fb-overlay";
    var modal = el("div", "cp-fb-modal");
    modal.appendChild(el("h2", "", "Facebook feed generator"));
    modal.appendChild(
      el("p", "", "Paste the Facebook Page link. The finished code is copied to your clipboard so you can paste it into a Custom HTML widget.")
    );

    if (!document.body.classList.contains("liveEditOn")) {
      modal.appendChild(
        el("div", "cp-fb-note", "Live Edit looks like it is off. Turn it on to add a Custom HTML widget to paste this into.")
      );
    }

    var linkInput = textInput("text", "", "https://www.facebook.com/YourPageName");
    modal.appendChild(field("Facebook Page link", linkInput));

    var widthInput = textInput("number", DEFAULTS.width);
    widthInput.min = String(LIMITS.minWidth);
    widthInput.max = String(LIMITS.maxWidth);
    var heightInput = textInput("number", DEFAULTS.height);
    heightInput.min = String(LIMITS.minHeight);
    heightInput.max = String(LIMITS.maxHeight);
    var sizes = el("div", "cp-fb-sizes");
    sizes.appendChild(field("Width (px)", widthInput, "Largest width, " + LIMITS.minWidth + " to " + LIMITS.maxWidth));
    sizes.appendChild(field("Height (px)", heightInput, "Largest height, " + LIMITS.minHeight + " to " + LIMITS.maxHeight));
    modal.appendChild(sizes);

    var titleInput = textInput("text", "", "Parks and Recreation Facebook feed");
    titleInput.required = true;
    titleInput.setAttribute("aria-required", "true");
    modal.appendChild(field("Feed title (required)", titleInput, "Read aloud by screen readers. Describe whose feed it is."));

    var checks = el("div", "cp-fb-checks");
    var showPosts = checkbox("Show posts", "(show_posts=true)", true);
    var timeline = checkbox("Add timeline tab", "(tabs=timeline) Facebook currently has problems with this one; leave it off unless you need it.", false);
    checks.appendChild(showPosts.row);
    checks.appendChild(timeline.row);
    modal.appendChild(checks);

    var errorLine = el("div", "cp-fb-error", "");
    modal.appendChild(errorLine);

    var result = el("div", "cp-fb-result");
    result.appendChild(el("span", "cp-fb-hint", "Generated code"));
    var codeBox = el("textarea", "cp-fb-code");
    codeBox.readOnly = true;
    var status = el("div", "cp-fb-status", "");
    result.appendChild(codeBox);
    result.appendChild(status);
    modal.appendChild(result);

    var actions = el("div", "cp-fb-actions");
    var closeBtn = el("button", "secondary", "Cancel");
    closeBtn.type = "button";
    var copyBtn = el("button", "primary", "Copy code");
    copyBtn.type = "button";
    actions.appendChild(closeBtn);
    actions.appendChild(copyBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var inputs = { link: linkInput, width: widthInput, height: heightInput, title: titleInput };

    function close() {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
    }

    function submit() {
      errorLine.textContent = "";
      var built = buildFacebookFeedCode({
        link: linkInput.value,
        width: widthInput.value,
        height: heightInput.value,
        title: titleInput.value,
        showPosts: showPosts.input.checked,
        timeline: timeline.input.checked
      });
      if (!built.ok) {
        errorLine.textContent = built.error;
        if (inputs[built.field]) inputs[built.field].focus();
        return;
      }

      codeBox.value = built.code;
      result.style.display = "flex";
      closeBtn.textContent = "Close";
      copyBtn.textContent = "Copy again";
      status.className = "cp-fb-status";
      status.textContent = "Copying…";

      copyText(built.code).then(function (copied) {
        if (copied) {
          status.className = "cp-fb-status ok";
          status.textContent = "Copied to your clipboard. Paste it into a Custom HTML widget.";
        } else {
          status.className = "cp-fb-status warn";
          status.textContent = "Could not copy automatically. Select the code above and copy it yourself.";
          codeBox.focus();
          codeBox.select();
        }
      });
    }

    function onKey(evt) {
      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      } else if ((evt.key === "Enter" || evt.key === "NumpadEnter") && evt.target && evt.target.tagName === "INPUT" && evt.target.type !== "checkbox") {
        evt.preventDefault();
        submit();
      }
    }
    document.addEventListener("keydown", onKey, true);

    copyBtn.addEventListener("click", submit);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (evt) {
      if (evt.target === overlay) close();
    });

    linkInput.focus();
  }

  try {
    openDialog();
  } catch (err) {
    alert("Facebook Feed Generator stopped: " + (err && err.message ? err.message : err));
  }
})();
