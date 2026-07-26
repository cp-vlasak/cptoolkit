const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function makeElement() {
  return {
    style: {},
    innerHTML: "",
    textContent: "",
    addEventListener() {},
    appendChild() {},
    remove() {}
  };
}

function testNativeCopyRegeneratesUnchangedAdvancedStyleText() {
  const scheduled = [];
  const writeCalls = [];
  let originalSaveCalls = 0;

  const copiedSkin = {
    Name: "Copied skin",
    WidgetSkinID: -1,
    RecordStatus: "New",
    Components: [
      {
        ComponentType: 1,
        MiscellaneousStyles: ".title { color: red; }",
        RecordStatus: "Unchanged"
      },
      {
        ComponentType: 2,
        MiscellaneousStyles: ".summary { margin: 0; }",
        RecordStatus: "Unchanged"
      }
    ]
  };
  const existingSameNameSkin = {
    Name: "Copied skin",
    WidgetSkinID: 333,
    RecordStatus: "Unchanged",
    Components: [
      {
        ComponentType: 9,
        MiscellaneousStyles: ".existing { color: blue; }",
        RecordStatus: "Unchanged"
      }
    ]
  };

  const document = {
    addEventListener() {},
    getElementById() { return null; },
    createElement() { return makeElement(); },
    head: { appendChild() {} },
    body: { appendChild() {} }
  };

  const context = vm.createContext({
    console,
    document,
    Date,
    RegExp,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeout() {},
    DesignCenter: {
      themeJSON: { WidgetSkins: [existingSameNameSkin, copiedSkin] },
      recordStatus: {
        New: "New",
        Modified: "Modified"
      },
      widgetSkinID: 999,
      writeThemeCSS: {
        writeWidgetSkinComponentStyle(componentType) {
          writeCalls.push({
            componentType,
            skinId: context.DesignCenter.widgetSkinID
          });
        }
      }
    },
    saveTheme() {
      originalSaveCalls++;
      if (copiedSkin.WidgetSkinID < 0) copiedSkin.WidgetSkinID = 222;
    }
  });
  context.window = context;
  context.globalThis = context;

  vm.runInContext(
    read("js/tools/on-load/helpers/fix-copied-skin-references-helper.js"),
    context,
    { filename: "fix-copied-skin-references-helper.js" }
  );

  context.CPToolkitFixCopiedSkin.pendingCopies.push({
    sourceSkinId: 111,
    timestamp: Date.now()
  });

  context.saveTheme();
  assert.strictEqual(originalSaveCalls, 1, "the CMS copy save should run first");

  const firstCheck = scheduled.find(task => task.delay === 2000);
  assert(firstCheck, "copy finalization should check after the first save");
  firstCheck.callback();

  const finalSave = scheduled.find(task => task.delay === 0);
  assert(finalSave, "regenerated copied styles should schedule a follow-up save");
  finalSave.callback();

  assert.strictEqual(originalSaveCalls, 2, "regenerated copied styles should be persisted automatically");
  assert.deepStrictEqual(
    copiedSkin.Components.map(component => component.MiscellaneousStyles),
    [".title { color: red; }", ".summary { margin: 0; }"],
    "copy finalization must preserve advanced-style text byte-for-byte"
  );
  assert.strictEqual(copiedSkin.RecordStatus, "Modified");
  assert(copiedSkin.Components.every(component => component.RecordStatus === "Modified"));
  assert.strictEqual(
    existingSameNameSkin.RecordStatus,
    "Unchanged",
    "an existing skin with the same name must not be selected"
  );
  assert.strictEqual(existingSameNameSkin.Components[0].RecordStatus, "Unchanged");
  assert.strictEqual(
    existingSameNameSkin.Components[0].MiscellaneousStyles,
    ".existing { color: blue; }"
  );
  assert.deepStrictEqual(
    writeCalls,
    [
      { componentType: 1, skinId: 222 },
      { componentType: 2, skinId: 222 }
    ],
    "every copied component should regenerate against the assigned skin ID"
  );
  assert.strictEqual(context.DesignCenter.widgetSkinID, 999, "the prior active skin ID should be restored");
}

function testComponentCopyDoesNotAppendWhitespace() {
  const source = read("js/tools/on-demand/copy-widget-skin-components.js");
  assert(
    !source.includes("comp.MiscellaneousStyles = (comp.MiscellaneousStyles || '') + ' ';"),
    "component-copy regeneration must not append a space to advanced-style text"
  );
}

testNativeCopyRegeneratesUnchangedAdvancedStyleText();
testComponentCopyDoesNotAppendWhitespace();
console.log("copied skin advanced-style tests passed");
