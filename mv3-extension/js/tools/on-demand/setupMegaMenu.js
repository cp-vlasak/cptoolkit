/**
 * Setup Mega Menu
 *
 * For every main navigation item that has Mega Menu turned on
 * (li.topMenuItem[data-displaymegamenu="True"]), finds that item's Mega Menu
 * container and its Pages widget, then saves the widget's options (format,
 * column count, depth, skin) through the same endpoint the widget options
 * popup uses.
 *
 * The skin can be kept as the widget already has it (read from the widget's
 * own skinNNN class), or chosen from the full skin list.
 */

function setOptions(pageID, contentCollectionID, widgetID, contentContainerID, skinID, columnCount) {
  return $.ajax({
    url: `\
/Pages/PagesWidget/Save?\
pageID=${pageID}&\
contentCollectionID=${contentCollectionID}&\
widgetID=${widgetID}&\
contentContainerID=${contentContainerID}&\
moduleID=null`,
    type: "POST",
    data: {
      options: [
        {
          WidgetID: widgetID,
          Name: "Format",
          Value: "3",
          ModuleWidgetOptionSetOptionID: 0
        },
        {
          WidgetID: widgetID,
          Name: "ColumnCount",
          Value: columnCount,
          ModuleWidgetOptionSetOptionID: 0
        },
        {
          WidgetID: widgetID,
          Name: "HeaderText",
          Value: "",
          ModuleWidgetOptionSetOptionID: 0
        },
        {
          WidgetID: widgetID,
          Name: "Depth",
          Value: "2",
          ModuleWidgetOptionSetOptionID: 0
        },
        {
          WidgetID: widgetID,
          Name: "WidgetSkinID",
          Value: skinID,
          ModuleWidgetOptionSetOptionID: 0
        }
      ],
      additionalOptions: [{ key: "WidgetBreakpoint", value: "25" }]
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Everything the page already says about one mega menu item, or null with a reason. */
function readMegaMenuTarget(navItem) {
  const name = (navItem.innerText || "").trim() || "(unnamed item)";
  const pageID = navItem.getAttribute("data-pageid");

  const mmContainer = $(`.megaMenuContainer.pageID_${pageID}`);
  if (mmContainer.length !== 1) return { name, problem: "its mega menu container was not found on the page" };

  const contentContainer = mmContainer.find(" > div.pageContent");
  if (contentContainer.length !== 1) return { name, problem: "its content container was not found" };
  const contentContainerID = contentContainer[0].getAttribute("data-containerid");

  const handle = contentContainer.find(
    " > .row.outer > .col.outer > .row.nest > .col.inner > a.handle.options.insideMegaMenu"
  );
  if (handle.length !== 1) return { name, problem: "its Pages widget was not found (it needs exactly one)" };
  const widgetID = handle[0].getAttribute("data-widgetid");

  const widget = $(`#widgetPage${widgetID}`);
  const skinMatch = (widget.attr("class") || "").match(/(?:^|\s)skin(\d+)(?:\s|$)/);
  const readNumber = (selector) => {
    const n = parseInt(widget.find(selector).first().text(), 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    name,
    pageID,
    contentContainerID,
    widgetID,
    currentSkinID: skinMatch ? skinMatch[1] : null,
    currentColumns: readNumber("div.cols"),
    currentFormat: readNumber("div.format"),
    currentDepth: readNumber("div.depth")
  };
}

/** Open one widget's options popup and read every skin listed there. */
async function readSkinOptions(handleEl) {
  handleEl.click();

  const optionSelector = ".cpTabPanel.insideMegaMenu select#skin > option";
  let skinList = $(optionSelector);
  for (let waited = 0; skinList.length === 0 && waited < 8000; waited += 250) {
    await sleep(250);
    skinList = $(optionSelector);
  }
  if (skinList.length === 0) {
    throw new Error(
      "Could not read the skin list from the Mega Menu widget options. " +
      "Open one Mega Menu widget's options manually once, then run this tool again."
    );
  }
  return skinList.get().map((option) => ({ id: option.value, name: option.innerText.trim() }));
}

// ==================== SETUP DIALOG ====================

function ensureMegaMenuSetupStyles() {
  if (document.getElementById("cp-mm-setup-style")) return;
  const style = document.createElement("style");
  style.id = "cp-mm-setup-style";
  style.textContent =
    ".cp-mm-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:20px;}" +
    ".cp-mm-modal{background:#fff;color:#222;max-width:620px;width:100%;max-height:90vh;display:flex;flex-direction:column;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,0.4);padding:20px;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}" +
    ".cp-mm-modal h2{margin:0 0 8px;font-size:20px;}" +
    ".cp-mm-modal p{margin:0 0 12px;font-size:14px;line-height:1.4;}" +
    ".cp-mm-choice{display:flex;align-items:flex-start;gap:8px;margin:0 0 8px;font-size:14px;line-height:1.4;cursor:pointer;}" +
    ".cp-mm-choice input{margin-top:3px;}" +
    ".cp-mm-search{width:100%;border:1px solid #c7c7c7;border-radius:4px;padding:6px;font-size:14px;margin:4px 0 6px;box-sizing:border-box;}" +
    ".cp-mm-select{width:100%;border:1px solid #c7c7c7;border-radius:4px;padding:6px;font-size:14px;min-height:200px;box-sizing:border-box;}" +
    ".cp-mm-meta{margin-top:6px;font-size:12px;color:#555;}" +
    ".cp-mm-cols{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:14px;}" +
    ".cp-mm-cols input{width:70px;border:1px solid #c7c7c7;border-radius:4px;padding:6px;font-size:14px;}" +
    ".cp-mm-error{margin-top:10px;font-size:13px;color:#b00020;min-height:1em;}" +
    ".cp-mm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}" +
    ".cp-mm-actions button{padding:8px 16px;font-size:14px;border-radius:4px;border:none;cursor:pointer;}" +
    ".cp-mm-actions button.primary{background:#af282f;color:#fff;}" +
    ".cp-mm-actions button.secondary{background:#f2f2f2;color:#333;}" +
    ".cp-mm-actions button:disabled{opacity:0.5;cursor:not-allowed;}";
  document.head.appendChild(style);
}

/**
 * One dialog for the skin and the column count.
 * Resolves { skinID, columns } (skinID null = keep each menu's current skin), or null if cancelled.
 */
function showMegaMenuSetupModal(options) {
  ensureMegaMenuSetupStyles();
  const canKeep = !!options.canKeepCurrent;

  return new Promise((resolve) => {
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };

    const overlay = el("div", "cp-mm-overlay");
    const modal = el("div", "cp-mm-modal");
    modal.appendChild(el("h2", "", "Set up mega menus"));
    modal.appendChild(
      el(
        "p",
        "",
        `${options.count} mega menu${options.count === 1 ? "" : "s"} will be set up. ` +
          `Choose the skin and column count to save on ${options.count === 1 ? "it" : "each one"}.`
      )
    );

    let mode = canKeep ? "keep" : "choose";
    const radios = {};
    if (canKeep) {
      [
        ["keep", options.keepLabel],
        ["choose", "Choose a skin from the list"]
      ].forEach(([value, label]) => {
        const row = el("label", "cp-mm-choice");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "cp-mm-skin-mode";
        input.checked = value === mode;
        radios[value] = input;
        row.appendChild(input);
        row.appendChild(el("span", "", label));
        modal.appendChild(row);
      });
    }

    const listBox = el("div", "cp-mm-list");
    const search = el("input", "cp-mm-search");
    search.type = "text";
    search.placeholder = "Search skins…";
    const select = el("select", "cp-mm-select");
    select.size = 12;
    const meta = el("div", "cp-mm-meta", "");
    listBox.appendChild(search);
    listBox.appendChild(select);
    listBox.appendChild(meta);
    modal.appendChild(listBox);

    const colsRow = el("label", "cp-mm-cols");
    colsRow.appendChild(el("span", "", "Column count"));
    const cols = document.createElement("input");
    cols.type = "number";
    cols.min = "1";
    cols.value = options.currentColumns || 3;
    colsRow.appendChild(cols);
    modal.appendChild(colsRow);

    const errorLine = el("div", "cp-mm-error", "");
    modal.appendChild(errorLine);

    const actions = el("div", "cp-mm-actions");
    const cancelBtn = el("button", "secondary", "Cancel");
    cancelBtn.type = "button";
    const goBtn = el("button", "primary", `Set up ${options.count} mega menu${options.count === 1 ? "" : "s"}`);
    goBtn.type = "button";
    actions.appendChild(cancelBtn);
    actions.appendChild(goBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let skins = null;
    let loading = false;
    let finished = false;

    function finish(value) {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    }

    function columnsValid() {
      return parseInt(cols.value, 10) >= 1;
    }

    function refreshButton() {
      goBtn.disabled = !columnsValid() || (mode === "choose" && !select.value);
    }

    function renderList() {
      const query = search.value.trim().toLowerCase();
      const keepSelected = select.value;
      select.innerHTML = "";
      (skins || [])
        .filter((skin) => !query || skin.name.toLowerCase().indexOf(query) !== -1)
        .forEach((skin) => {
          const option = document.createElement("option");
          option.value = skin.id;
          option.textContent = `${skin.name} (${skin.id})`;
          select.appendChild(option);
        });
      if (keepSelected && select.querySelector(`option[value="${keepSelected}"]`)) select.value = keepSelected;
      else if (select.options.length === 1) select.selectedIndex = 0;
      if (skins) {
        meta.textContent = `${select.options.length} of ${skins.length} skin${skins.length === 1 ? "" : "s"} shown`;
      }
      refreshButton();
    }

    function loadSkinsOnce() {
      if (skins || loading) return;
      loading = true;
      meta.textContent = "Loading skins…";
      goBtn.disabled = true;
      options
        .loadSkins()
        .then((list) => {
          skins = list;
          // Preselect the menu's current skin, otherwise the only name that looks like a mega menu skin.
          const current = list.find((s) => s.id === options.currentSkinID);
          const likely = list.filter((s) => /mega|menu|mm/i.test(s.name));
          const preselect = current || (likely.length === 1 ? likely[0] : null);
          renderList();
          if (preselect) select.value = preselect.id;
          else search.focus();
          refreshButton();
        })
        .catch((err) => {
          errorLine.textContent = err && err.message ? err.message : String(err);
          meta.textContent = "";
        })
        .then(() => {
          loading = false;
        });
    }

    function setMode(next) {
      mode = next;
      listBox.style.display = mode === "choose" ? "" : "none";
      if (mode === "choose") loadSkinsOnce();
      refreshButton();
    }

    function submit() {
      if (goBtn.disabled) return;
      finish({
        skinID: mode === "choose" ? select.value : null,
        columns: parseInt(cols.value, 10)
      });
    }

    function onKey(evt) {
      if (evt.key === "Escape") {
        evt.preventDefault();
        finish(null);
      } else if ((evt.key === "Enter" || evt.key === "NumpadEnter") && !goBtn.disabled) {
        evt.preventDefault();
        submit();
      }
    }
    document.addEventListener("keydown", onKey, true);

    if (canKeep) {
      radios.keep.addEventListener("change", () => setMode("keep"));
      radios.choose.addEventListener("change", () => setMode("choose"));
    }
    search.addEventListener("input", renderList);
    select.addEventListener("change", refreshButton);
    select.addEventListener("dblclick", submit);
    cols.addEventListener("input", refreshButton);
    goBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", () => finish(null));
    overlay.addEventListener("click", (evt) => {
      if (evt.target === overlay) finish(null);
    });

    setMode(mode);
  });
}

async function setupMegaMenu() {
  const contentCollectionID = $("input#hdnContentCollectionID")[0].value;

  const navItems = $(".rootNavMenu#mainNavMenu > li.topMenuItem").filter(
    (_, navItem) => navItem.getAttribute("data-displaymegamenu") === "True"
  );
  console.log(`[CP Toolkit] Setup Mega Menu: ${navItems.length} main nav item(s) have Mega Menu turned on`);
  if (navItems.length === 0) {
    alert(
      "No main navigation items have Mega Menu turned on, so there is nothing to set up. " +
      "Set each item to Mega Menu first, then run this tool again."
    );
    return;
  }

  const found = navItems.get().map(readMegaMenuTarget);
  const targets = found.filter((t) => !t.problem);
  const skipped = found.filter((t) => t.problem);
  skipped.forEach((t) => console.warn(`[CP Toolkit] Setup Mega Menu: skipping ${t.name}: ${t.problem}`));
  if (targets.length === 0) {
    alert("No mega menu could be set up:\n\n" + skipped.map((t) => `${t.name}: ${t.problem}`).join("\n"));
    return;
  }

  // One dialog for the skin (keep each menu's own, or pick from the full list) and the column count.
  const currentSkins = Array.from(new Set(targets.map((t) => t.currentSkinID)));
  const canKeepCurrent = targets.every((t) => t.currentSkinID);
  const firstHandle = $(`#widgetPage${targets[0].widgetID}`)
    .closest(".pageContent")
    .find("a.handle.options.insideMegaMenu")[0];

  const choice = await showMegaMenuSetupModal({
    count: targets.length,
    canKeepCurrent,
    keepLabel:
      currentSkins.length === 1
        ? `Keep the skin the menus already use (skin ${currentSkins[0]})`
        : "Keep each menu's own skin (they currently differ)",
    currentSkinID: targets[0].currentSkinID,
    currentColumns: targets[0].currentColumns,
    loadSkins: () => readSkinOptions(firstHandle)
  });
  if (!choice) return;
  const chosenSkinID = choice.skinID;
  const columnCount = choice.columns;

  const requests = targets.map((t) =>
    setOptions(t.pageID, contentCollectionID, t.widgetID, t.contentContainerID, chosenSkinID || t.currentSkinID, columnCount)
  );
  const results = await Promise.allSettled(requests);
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[CP Toolkit] Setup Mega Menu: ${results.length - failed} saved, ${failed} failed, ${skipped.length} skipped`);

  if (failed > 0 || skipped.length > 0) {
    alert(
      `Mega Menu setup: ${results.length - failed} saved, ${failed} failed to save, ${skipped.length} skipped.` +
        (skipped.length ? "\n\nSkipped:\n" + skipped.map((t) => `${t.name}: ${t.problem}`).join("\n") : "")
    );
  }
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

setupMegaMenu().catch((err) => {
  console.error("[CP Toolkit] Setup Mega Menu failed:", err);
  alert("Setup Mega Menu stopped: " + (err && err.message ? err.message : err));
});
