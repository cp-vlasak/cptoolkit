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

/** Open one widget's options popup and let the user pick from every skin listed there. */
async function chooseSkinFromList(handleEl, suggestedID) {
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

  const skins = skinList.get().map((option) => ({ id: option.value, name: option.innerText.trim() }));
  const likely = skins.filter((s) => /mega|menu|mm/i.test(s.name));
  const suggested =
    skins.findIndex((s) => s.id === suggestedID) !== -1
      ? skins.findIndex((s) => s.id === suggestedID) + 1
      : likely.length === 1
        ? skins.indexOf(likely[0]) + 1
        : "";

  const answer = prompt(
    "Which skin should the mega menus use? Enter its number:\n\n" +
      skins.map((s, i) => `${i + 1}. ${s.name}`).join("\n"),
    suggested
  );
  if (answer === null) throw new Error("Cancelled: no skin was chosen.");

  const picked = skins[parseInt(answer, 10) - 1];
  if (!picked) throw new Error(`"${answer}" is not one of the numbers in the skin list.`);
  return picked.id;
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

  // Skin: keep what each widget already has, or choose one for all of them.
  const currentSkins = Array.from(new Set(targets.map((t) => t.currentSkinID)));
  let chosenSkinID = null;
  const canKeepCurrent = targets.every((t) => t.currentSkinID);
  const keepCurrent =
    canKeepCurrent &&
    confirm(
      currentSkins.length === 1
        ? `All ${targets.length} mega menu(s) use skin ${currentSkins[0]} right now.\n\n` +
            "OK = keep that skin.\nCancel = choose a skin from the list."
        : `The ${targets.length} mega menu(s) use different skins right now.\n\n` +
            "OK = keep each menu's own skin.\nCancel = use one skin for all of them."
    );
  if (!keepCurrent) {
    const firstHandle = $(`#widgetPage${targets[0].widgetID}`)
      .closest(".pageContent")
      .find("a.handle.options.insideMegaMenu")[0];
    chosenSkinID = await chooseSkinFromList(firstHandle, targets[0].currentSkinID);
  }

  const columnAnswer = prompt("Column count?", targets[0].currentColumns || "");
  if (columnAnswer === null) throw new Error("Cancelled: no column count was entered.");
  const columnCount = parseInt(columnAnswer, 10);
  if (!(columnCount >= 1)) throw new Error(`"${columnAnswer}" is not a valid column count.`);

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
