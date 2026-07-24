const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runScript(relativePath, context) {
  vm.runInContext(read(relativePath), context, { filename: relativePath });
}

function createElement(className) {
  return {
    id: "",
    className: className || "",
    tagName: "DIV",
    closest() { return null; },
    getAttribute() { return ""; }
  };
}

async function testDetectorPerformsFreshDeadlineEvaluation() {
  let shellReady = false;
  const document = {
    documentElement: {},
    querySelectorAll(selector) {
      if (shellReady && selector === ".cp-Toolbar") {
        return [createElement("cp-Toolbar")];
      }
      return [];
    }
  };

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const context = vm.createContext({
    document,
    location: { hostname: "32.civic.place", pathname: "/Admin/" },
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    console
  });
  context.self = context;
  context.globalThis = context;
  runScript("js/content/cp-dom-detector.js", context);

  const detection = context.CPToolkitDomDetector.waitForDetection({ timeoutMs: 20 });
  shellReady = true;
  const result = await detection;

  assert(result.lanes.includes("admin"), "deadline must evaluate the current admin shell");
  assert.strictEqual(result.scores.admin, 6);
}

async function testActivationMessageRetriesUntilAcknowledged() {
  const calls = [];
  const adminResult = { lanes: ["admin"] };
  const context = vm.createContext({
    document: { body: {}, readyState: "complete", addEventListener() {} },
    location: { hostname: "32.civic.place", pathname: "/Admin/" },
    setTimeout(callback, delay) { return setTimeout(callback, Math.min(delay, 5)); },
    clearTimeout,
    console,
    CPToolkitDomDetector: {
      lanes: {
        ADMIN: "admin",
        LIVE_EDIT: "live-edit",
        ALL_PAGES_CP_HOST_CSS: "all-pages-cp-host-css",
        IDENTITY: "identity"
      },
      defaultTimeoutMs: 7000,
      evaluatePage() { return adminResult; },
      waitForDetection() { return Promise.resolve(adminResult); }
    },
    chrome: {
      runtime: {
        sendMessage(payload) {
          calls.push(payload);
          if (calls.length === 1) return Promise.reject(new Error("transient worker wake failure"));
          return Promise.resolve({ result: { injected: true, state: "complete" } });
        }
      }
    }
  });
  context.top = context;
  context.self = context;
  context.window = context;
  context.globalThis = context;
  runScript("js/content/toolkit-activation-bootstrap.js", context);

  await new Promise(resolve => setTimeout(resolve, 35));

  assert.strictEqual(calls.length, 2, "a rejected first delivery must be retried");
  assert.strictEqual(calls[0].activationId, calls[1].activationId, "retries reuse one document activation id");
  assert.strictEqual(context.__cpToolkitActivationDeliveryState["full-toolkit"].status, "complete");
}

async function testFailedInjectionClearsPendingClaim() {
  let fileInjectionAttempts = 0;
  const context = vm.createContext({
    URL,
    Date,
    Math,
    Promise,
    console,
    setTimeout,
    clearTimeout
  });
  context.self = context;
  context.globalThis = context;

  context.chrome = {
    runtime: { id: "test-extension" },
    storage: {
      local: {
        get() { return Promise.resolve({}); },
        set() { return Promise.resolve(); }
      }
    },
    permissions: {
      contains() { return Promise.resolve(true); },
      onRemoved: { addListener() {} }
    },
    scripting: {
      getRegisteredContentScripts() { return Promise.resolve([]); },
      registerContentScripts() { return Promise.resolve(); },
      updateContentScripts() { return Promise.resolve(); },
      unregisterContentScripts() { return Promise.resolve(); },
      executeScript(details) {
        if (details.func) {
          return Promise.resolve([{ result: details.func(...(details.args || [])) }]);
        }
        fileInjectionAttempts += 1;
        if (fileInjectionAttempts === 1) {
          return Promise.reject(new Error("simulated file injection failure"));
        }
        return Promise.resolve([{ result: undefined }]);
      }
    },
    tabs: { get() { return Promise.resolve({ url: "https://32.civic.place/Admin/" }); } }
  };

  runScript("js/background/toolkit-injection-registry.js", context);
  runScript("js/background/toolkit-activation.js", context);

  function activate(activationId) {
    return new Promise(resolve => {
      const handled = context.CPToolkitActivation.handleMessage({
        action: "cp-toolkit-activation-detected",
        activationKind: "full-toolkit",
        lanes: ["admin"],
        activationId
      }, {
        id: "test-extension",
        url: "https://32.civic.place/Admin/",
        frameId: 0,
        tab: { id: 32 }
      }, resolve);
      assert.strictEqual(handled, true);
    });
  }

  const failed = await activate("activation-one");
  assert(failed.error, "the simulated injection failure must reach the caller");
  assert.strictEqual(
    context.__cpToolkitInjectionStates && context.__cpToolkitInjectionStates["full-toolkit:admin"],
    undefined,
    "a failed injection must clear its pending claim"
  );

  const succeeded = await activate("activation-two");
  assert.strictEqual(succeeded.result.injected, true, "the same document must be able to recover");
  assert.strictEqual(context.__cpToolkitInjectionStates["full-toolkit:admin"].status, "complete");
}

async function testOverlappingActivationDoesNotReclaimLivePendingInjection() {
  let fileInjectionAttempts = 0;
  let resolveFirstInjection;
  const firstInjection = new Promise(resolve => { resolveFirstInjection = resolve; });
  const context = vm.createContext({
    URL,
    Date,
    Math,
    Promise,
    console,
    setTimeout,
    clearTimeout
  });
  context.self = context;
  context.globalThis = context;

  context.chrome = {
    runtime: { id: "test-extension" },
    storage: {
      local: {
        get() { return Promise.resolve({}); },
        set() { return Promise.resolve(); }
      }
    },
    permissions: {
      contains() { return Promise.resolve(true); },
      onRemoved: { addListener() {} }
    },
    scripting: {
      getRegisteredContentScripts() { return Promise.resolve([]); },
      registerContentScripts() { return Promise.resolve(); },
      updateContentScripts() { return Promise.resolve(); },
      unregisterContentScripts() { return Promise.resolve(); },
      executeScript(details) {
        if (details.func) {
          return Promise.resolve([{ result: details.func(...(details.args || [])) }]);
        }
        fileInjectionAttempts += 1;
        if (fileInjectionAttempts === 1) return firstInjection;
        return Promise.resolve([{ result: undefined }]);
      }
    },
    tabs: { get() { return Promise.resolve({ url: "https://32.civic.place/Admin/" }); } }
  };

  runScript("js/background/toolkit-injection-registry.js", context);
  runScript("js/background/toolkit-activation.js", context);

  function activate(activationId) {
    return new Promise(resolve => {
      context.CPToolkitActivation.handleMessage({
        action: "cp-toolkit-activation-detected",
        activationKind: "full-toolkit",
        lanes: ["admin"],
        activationId
      }, {
        id: "test-extension",
        url: "https://32.civic.place/Admin/",
        frameId: 0,
        tab: { id: 32 }
      }, resolve);
    });
  }

  const first = activate("slow-first");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(fileInjectionAttempts, 1);

  context.__cpToolkitInjectionStates["full-toolkit:admin"].startedAt -= 2000;
  const overlapping = await activate("overlap-second");

  assert.strictEqual(overlapping.result.pending, true, "a live pending injection must remain owned by the first activation");
  assert.strictEqual(fileInjectionAttempts, 1, "the full bundle must not be injected a second time");

  resolveFirstInjection([{ result: undefined }]);
  const completed = await first;
  assert.strictEqual(completed.result.injected, true);
}

async function testChromeErrorPageIsRecoverableTargetUnavailable() {
  const context = vm.createContext({
    URL,
    Date,
    Math,
    Promise,
    console,
    setTimeout,
    clearTimeout
  });
  context.self = context;
  context.globalThis = context;

  context.chrome = {
    runtime: { id: "test-extension" },
    storage: {
      local: {
        get() { return Promise.resolve({}); },
        set() { return Promise.resolve(); }
      }
    },
    permissions: {
      contains() { return Promise.resolve(true); },
      onRemoved: { addListener() {} }
    },
    scripting: {
      getRegisteredContentScripts() { return Promise.resolve([]); },
      registerContentScripts() { return Promise.resolve(); },
      updateContentScripts() { return Promise.resolve(); },
      unregisterContentScripts() { return Promise.resolve(); },
      executeScript() {
        return Promise.reject(new Error("Frame with ID 0 is showing error page"));
      }
    },
    tabs: { get() { return Promise.resolve({ url: "https://32.civic.place/Admin/" }); } }
  };

  runScript("js/background/toolkit-injection-registry.js", context);
  runScript("js/background/toolkit-activation.js", context);

  const response = await new Promise(resolve => {
    const handled = context.CPToolkitActivation.handleMessage({
      action: "cp-toolkit-activation-detected",
      activationKind: "full-toolkit",
      lanes: ["admin"],
      activationId: "error-page-attempt"
    }, {
      id: "test-extension",
      url: "https://32.civic.place/Admin/",
      frameId: 0,
      tab: { id: 32 }
    }, resolve);
    assert.strictEqual(handled, true);
  });

  assert.strictEqual(response.error, undefined, "an error-page race must not be reported as a hard activation failure");
  assert.strictEqual(response.result.skipped, "target-unavailable");
  assert.strictEqual(response.result.message, "Frame with ID 0 is showing error page");
}

function testPageScopedInventoryPreservesRelevantTools() {
  const context = vm.createContext({ URL });
  context.self = context;
  context.globalThis = context;
  runScript("js/background/toolkit-injection-registry.js", context);

  function idsFor(url) {
    return context.CPToolkitInjectionRegistry
      .getEntriesForLane("admin", url)
      .map(entry => entry.id);
  }

  const dashboard = idsFor("https://32.civic.place/Admin/Dashboard#!/recentactivity");
  const graphicLinks = idsFor("https://32.civic.place/Admin/GraphicLinks.aspx");
  const infoCenter = idsFor("https://32.civic.place/Admin/InfoII.aspx");

  assert(dashboard.includes("mini-ide"), "uncertain editor locations must remain broadly available");
  assert(!dashboard.includes("cp-ImportFancyButton"), "Graphic Links importer must not load on Dashboard");
  assert(!dashboard.includes("cp-InfoAdvancedImportExport"), "Info Center importer must not load on Dashboard");
  assert(graphicLinks.includes("fancy-button-library"), "Graphic Links importer dependency must remain available");
  assert(graphicLinks.includes("cp-ImportFancyButton"), "Graphic Links importer must load on its supported page");
  assert(infoCenter.includes("cp-InfoAdvancedImportExport"), "Info Center importer must load on its supported page");
  assert(infoCenter.includes("cp-MultipleInfoAdvancedItems"), "Info Center multi-item tool must remain available");
}

async function testPermissionGrantBootstrapsOpenVanityTabWithoutPopup() {
  const stored = {};
  const sessionStored = {};
  const registeredScripts = [];
  const fileInjections = [];
  let permissionAddedListener = null;
  const vanityOrigin = "https://vanity.test/*";
  const vanityUrl = "https://vanity.test/Admin/DesignCenter";

  const context = vm.createContext({
    URL,
    Date,
    Math,
    Promise,
    console,
    setTimeout,
    clearTimeout
  });
  context.self = context;
  context.globalThis = context;

  function storageArea(values) {
    return {
      get(key) {
        if (typeof key === "string") return Promise.resolve({ [key]: values[key] });
        return Promise.resolve({ ...values });
      },
      set(nextValues) {
        Object.assign(values, nextValues);
        return Promise.resolve();
      }
    };
  }

  context.chrome = {
    runtime: { id: "test-extension" },
    storage: {
      local: storageArea(stored),
      session: storageArea(sessionStored)
    },
    permissions: {
      contains() { return Promise.resolve(true); },
      onAdded: { addListener(listener) { permissionAddedListener = listener; } },
      onRemoved: { addListener() {} }
    },
    scripting: {
      getRegisteredContentScripts({ ids }) {
        return Promise.resolve(registeredScripts.filter(script => ids.includes(script.id)));
      },
      registerContentScripts(scripts) {
        registeredScripts.push(...scripts);
        return Promise.resolve();
      },
      updateContentScripts(scripts) {
        scripts.forEach(next => {
          const index = registeredScripts.findIndex(current => current.id === next.id);
          if (index >= 0) registeredScripts[index] = next;
        });
        return Promise.resolve();
      },
      unregisterContentScripts() { return Promise.resolve(); },
      executeScript(details) {
        if (details.func) {
          return Promise.resolve([{ result: details.func(...(details.args || [])) }]);
        }
        fileInjections.push(details.files.slice());
        return Promise.resolve([{ result: undefined }]);
      }
    },
    tabs: {
      get(tabId) {
        assert.strictEqual(tabId, 44);
        return Promise.resolve({ id: 44, url: vanityUrl });
      }
    }
  };

  runScript("js/background/toolkit-injection-registry.js", context);
  runScript("js/background/toolkit-activation.js", context);

  assert.strictEqual(typeof permissionAddedListener, "function", "the service worker must own the permission-granted event");

  const unrelatedGrant = await context.CPToolkitActivation.handleAddedPermissions({
    origins: [vanityOrigin]
  });
  assert.strictEqual(unrelatedGrant[0].skipped, "no-pending-trust-intent");
  assert.strictEqual(registeredScripts.length, 0, "an unrelated exact-origin grant must not become toolkit trust");
  assert.strictEqual(fileInjections.length, 0);

  const prepared = await new Promise(resolve => {
    context.CPToolkitActivation.handleMessage({
      action: "cp-toolkit-prepare-trusted-origin",
      originPattern: vanityOrigin,
      tabId: 44,
      lanes: ["admin"]
    }, {
      id: "test-extension"
    }, resolve);
  });
  assert.strictEqual(prepared.result.prepared, true);

  const results = await context.CPToolkitActivation.handleAddedPermissions({
    origins: [vanityOrigin]
  });

  assert.strictEqual(results.length, 1);
  assert.deepStrictEqual(
    Array.from(stored["cp-toolkit-trusted-vanity-origins"]),
    [vanityOrigin],
    "the granted exact origin must be persisted"
  );
  assert.strictEqual(registeredScripts.length, 1, "the persistent detector must be registered");
  assert.strictEqual(registeredScripts[0].matches[0], vanityOrigin);
  assert.deepStrictEqual(
    Array.from(fileInjections[0]),
    [
      "js/content/cp-dom-detector.js",
      "js/content/toolkit-activation-bootstrap.js"
    ],
    "the already-open vanity tab must be bootstrapped immediately"
  );
}

async function main() {
  await testDetectorPerformsFreshDeadlineEvaluation();
  await testActivationMessageRetriesUntilAcknowledged();
  await testFailedInjectionClearsPendingClaim();
  await testOverlappingActivationDoesNotReclaimLivePendingInjection();
  await testChromeErrorPageIsRecoverableTargetUnavailable();
  testPageScopedInventoryPreservesRelevantTools();
  await testPermissionGrantBootstrapsOpenVanityTabWithoutPopup();
  console.log("activation reliability tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
