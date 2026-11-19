const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadLibrary() {
  const sandbox = { window: {} };
  vm.runInNewContext(read("js/shared/fancy-button-library.js"), sandbox);
  return sandbox.window.CPToolkitFancyButtonLibrary;
}

const lib = loadLibrary();

function testRemoveKeysRemovesOnlyTheNamedButtons() {
  const original = { A: { n: 1 }, B: { n: 2 }, C: { n: 3 } };
  const result = lib.removeKeys(original, ["A", "C"]);
  assert.deepStrictEqual(Object.keys(result.library), ["B"]);
  assert.strictEqual(result.removed, 2);
  assert.deepStrictEqual(Object.keys(original), ["A", "B", "C"], "the original library object is not mutated");
}

function testRemoveKeysIgnoresUnknownAndBadInput() {
  assert.strictEqual(lib.removeKeys({ A: 1 }, ["nope"]).removed, 0);
  assert.strictEqual(lib.removeKeys({ A: 1 }, []).removed, 0);
  assert.strictEqual(lib.removeKeys({ A: 1 }, null).removed, 0);
  assert.deepStrictEqual(Object.keys(lib.removeKeys(null, ["A"]).library), []);
  // inherited names (e.g. "toString") are never "removed"
  assert.strictEqual(lib.removeKeys({ A: 1 }, ["toString", "hasOwnProperty"]).removed, 0);
}

function testBothSurfacesHaveTheBulkDeleteControls() {
  const modal = read("js/tools/on-load/cp-ImportFancyButton.js");
  ["cp-lib-select", "cp-bulk-delete", "cp-bulk-all", "cp-bulk-clear", "cp-bulk-done"].forEach((id) => {
    assert.ok(modal.indexOf('id="' + id + '"') !== -1, "modal has #" + id);
  });
  assert.ok(modal.indexOf("removeKeys(") !== -1, "modal deletes through the shared helper");

  const page = read("html/button-library.html");
  ["btn-select", "bulk-delete", "bulk-all", "bulk-clear", "bulk-done"].forEach((id) => {
    assert.ok(page.indexOf('id="' + id + '"') !== -1, "full page has #" + id);
  });
  assert.ok(read("js/button-library-page.js").indexOf("removeKeys(") !== -1, "full page deletes through the shared helper");
}

[
  testRemoveKeysRemovesOnlyTheNamedButtons,
  testRemoveKeysIgnoresUnknownAndBadInput,
  testBothSurfacesHaveTheBulkDeleteControls
].forEach((test) => {
  test();
  console.log("ok - " + test.name);
});
