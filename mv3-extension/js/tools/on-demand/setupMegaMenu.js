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

async function getSkinID() {
  const handle = $("a.handle.options.insideMegaMenu");
  if (handle.length > 0) handle[0].click();

  // Wait for the options popup to load its skin list (it can take a few seconds).
  let skinList = $(".cpTabPanel.insideMegaMenu select#skin > option");
  for (let waited = 0; skinList.length === 0 && waited < 8000; waited += 250) {
    await sleep(250);
    skinList = $(".cpTabPanel.insideMegaMenu select#skin > option");
  }
  if (skinList.length === 0) {
    throw new Error(
      "Could not read the skin list from the Mega Menu widget options. " +
      "Open one Mega Menu widget's options manually once, then run this tool again."
    );
  }

  function filterSkins(opts, list) {
    return list.filter((_, skin) => {
      const name = skin.innerText;
      for (const matchElem of opts) {
        if (name.toLowerCase().indexOf(matchElem) !== -1) {
          return true;
        }
      }
      return false;
    });
  }

  let matchingSkins = filterSkins(["mega", "menu", "mm"], skinList);

  let skinID;
  if (matchingSkins.length > 1) {
    // prettier-ignore
    const resp = prompt(`Multiple matching skins, enter one of: [${
      matchingSkins.get().map((skin) => skin.innerText).join(", ")
    }]`);
    if (resp === null) throw new Error("Cancelled: no skin was chosen.");

    const typed = resp.trim().toLowerCase();
    const exact = matchingSkins.filter((_, skin) => skin.innerText.trim().toLowerCase() === typed);
    matchingSkins = exact.length === 1 ? exact : filterSkins([typed], matchingSkins);
    if (matchingSkins.length === 1) skinID = matchingSkins[0].value;
    else throw new Error(`"${resp}" does not match exactly one skin. Run the tool again and type a skin name in full.`);
  } else if (matchingSkins.length === 1) {
    skinID = matchingSkins[0].value;
  } else {
    alert("No matching skin found. Setting to skinList[0]");
    skinID = skinList[0].value;
  }

  return skinID;
}

async function setupMegaMenu() {
  const requests = [];

  const skinID = await getSkinID();
  const columnCount = prompt("Column count? ");
  const contentCollectionID = $("input#hdnContentCollectionID")[0].value;

  const mainNavItems = $(".rootNavMenu#mainNavMenu > li.topMenuItem").filter(
    (_, navItem) => navItem.getAttribute("data-displaymegamenu") === "True"
  );
  console.log(`[CP Toolkit] Setup Mega Menu: ${mainNavItems.length} main nav item(s) have Mega Menu turned on`);
  if (mainNavItems.length === 0) {
    alert(
      "No main navigation items have Mega Menu turned on, so there is nothing to set up. " +
      "Set each item to Mega Menu first, then run this tool again."
    );
    return;
  }

  for (let i = 0; i < mainNavItems.length; i++) {
    const navItem = mainNavItems[i];

    const pageID = navItem.getAttribute("data-pageid");

    const mmContainer = $(`.megaMenuContainer.pageID_${pageID}`);
    if (mmContainer.length !== 1) {
      console.warn(`Failed to set Mega Menu options on ${navItem.innerText}`);
      alert(`Failed to set Mega Menu options on ${navItem.innerText}`);
      continue;
    }

    const contentContainer = mmContainer.find(" > div.pageContent");
    if (contentContainer.length !== 1) {
      console.warn(`Failed to find contentContainer on ${navItem.innerText}`);
      alert(`Failed to find contentContainer on ${navItem.innerText}`);
      continue;
    }
    const contentContainerID = contentContainer[0].getAttribute("data-containerid");

    // Unsure if this is the best way to find, but it seemed like the most filtered option...?
    const mmWidgetHandle = contentContainer.find(
      " > .row.outer > .col.outer > .row.nest > .col.inner > a.handle.options.insideMegaMenu"
    );
    if (mmWidgetHandle.length !== 1) {
      console.warn(`Failed to find widget handle on ${navItem.innerText}`);
      alert(`Failed to find widget handle on ${navItem.innerText}`);
      continue;
    }
    const widgetID = mmWidgetHandle[0].getAttribute("data-widgetid");

    requests.push(setOptions(pageID, contentCollectionID, widgetID, contentContainerID, skinID, columnCount));
  }

  const results = await Promise.allSettled(requests);
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[CP Toolkit] Setup Mega Menu: ${results.length - failed} saved, ${failed} failed`);
  if (failed > 0) alert(`Mega Menu setup: ${failed} of ${results.length} item(s) failed to save. See the console.`);
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

setupMegaMenu().catch((err) => {
  console.error("[CP Toolkit] Setup Mega Menu failed:", err);
  alert("Setup Mega Menu stopped: " + (err && err.message ? err.message : err));
});
