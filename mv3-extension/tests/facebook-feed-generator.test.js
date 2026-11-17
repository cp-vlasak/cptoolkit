const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadBuilder() {
  const sandbox = { window: { __CP_FB_FEED_TEST__: { noUI: true } }, URL, URLSearchParams };
  vm.runInNewContext(read("js/tools/on-demand/facebook-feed-generator.js"), sandbox);
  return sandbox.window.__CP_FB_FEED_TEST__.exports;
}

const tool = loadBuilder();

function build(overrides) {
  return tool.buildFacebookFeedCode(
    Object.assign(
      { link: "https://www.facebook.com/townofduck", width: "500", height: "520", showPosts: true, timeline: false, title: "Town of Duck Facebook feed" },
      overrides || {}
    )
  );
}

function testLinkParsing() {
  const same = "https://www.facebook.com/CityOfX";
  const cases = [
    "https://www.facebook.com/CityOfX",
    "facebook.com/CityOfX/",
    "HTTP://M.Facebook.com/CityOfX?ref=share#top",
    "https://web.facebook.com/CityOfX/",
    "  https://www.facebook.com/CityOfX  "
  ];
  cases.forEach((input) => {
    const parsed = tool.parseFacebookLink(input);
    assert.strictEqual(parsed.ok, true, "should accept: " + input);
    assert.strictEqual(parsed.href, same, "normalised href for: " + input);
  });

  const profile = tool.parseFacebookLink("https://www.facebook.com/profile.php?id=100012345&sk=wall");
  assert.strictEqual(profile.href, "https://www.facebook.com/profile.php?id=100012345");

  const pasted = tool.parseFacebookLink(
    "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2FCityOfX&tabs=timeline&width=340"
  );
  assert.strictEqual(pasted.href, same, "a pasted plugin src should use its href");
}

function testRejectsBadLinks() {
  [
    "",
    "   ",
    "not a link",
    "https://evil.com/www.facebook.com/x",
    "https://www.facebook.com.evil.com/x",
    "https://notfacebook.com/x",
    "javascript:alert(1)",
    "ftp://www.facebook.com/x",
    "https://www.facebook.com/",
    "https://www.facebook.com/profile.php?id=abc",
    "https://www.facebook.com/plugins/page.php",
    "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fplugins%2Fpage.php%3Fhref%3Dx"
  ].forEach((input) => {
    const parsed = tool.parseFacebookLink(input);
    assert.strictEqual(parsed.ok, false, "should reject: " + JSON.stringify(input));
    assert.ok(parsed.error && parsed.error.length > 5, "needs a message for: " + JSON.stringify(input));
  });
}

function testMatchesWorkingReference() {
  const built = build({ width: "500", height: "520" });
  assert.strictEqual(built.ok, true);
  // The working reference feed, with its 488 width (set by the resize script after load) written as 500.
  const referenceIframe =
    '<iframe src="https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Ftownofduck&show_posts=true&width=500&height=520&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true&appId" title="Town of Duck Facebook feed" width="500" height="520" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
  const expectedStart =
    '<div class="facebook-container">\n' + referenceIframe + '\n</div>\n\n<style>\n  [class^="facebook-container"] {\n    text-align: center;\n  }\n</style>\n\n<script>\n  (function () {\n    var selector = \'.facebook-container\';\n';
  assert.ok(built.code.indexOf(expectedStart) === 0, "output should start exactly like the working reference");
  ["var minWidth = 220;", "var maxWidth = 500;", "var minHeight = 350;", "var maxHeight = 520;", "var aspectRatio = 1.4;"].forEach((line) => {
    assert.ok(built.code.indexOf("    " + line) !== -1, "script should contain: " + line);
  });
  assert.ok(/<\/script>$/.test(built.code), "output should end with the closing script tag");
}

function testOptions() {
  const off = build({ showPosts: true, timeline: false });
  assert.ok(off.code.indexOf("show_posts=true") !== -1);
  assert.ok(off.code.indexOf("tabs=timeline") === -1, "timeline is off by default");

  const timeline = build({ timeline: true });
  const iframeStart = timeline.code.indexOf("<iframe");
  const order = ["href=", "tabs=timeline", "show_posts=true", "width=500", "height=520"].map((s) => timeline.code.indexOf(s, iframeStart));
  assert.ok(order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1])), "parameters should be in the documented order");

  const noPosts = build({ showPosts: false });
  assert.ok(noPosts.code.indexOf("show_posts") === -1, "show_posts is left out when unticked");

  // The iframe title is required for screen readers (WCAG): blank, spaces-only and missing are all refused.
  ["", "   ", "\n\t "].forEach((blank) => {
    const refused = build({ title: blank });
    assert.strictEqual(refused.ok, false, "blank title must be refused");
    assert.strictEqual(refused.field, "title");
  });
  assert.strictEqual(tool.buildFacebookFeedCode({ link: "https://www.facebook.com/x", width: "500", height: "520", showPosts: true }).ok, false, "missing title must be refused");
  assert.ok(build({ title: "  Parks   and Recreation  " }).code.indexOf('title="Parks and Recreation"') !== -1, "title is tidied");
}

function testSizeLimits() {
  [
    ["width", { width: "219" }],
    ["width", { width: "501" }],
    ["width", { width: "abc" }],
    ["width", { width: "300.5" }],
    ["width", { width: "" }],
    ["height", { height: "349" }],
    ["height", { height: "1001" }],
    ["height", { height: "-5" }]
  ].forEach(([field, overrides]) => {
    const built = build(overrides);
    assert.strictEqual(built.ok, false, "should reject " + JSON.stringify(overrides));
    assert.strictEqual(built.field, field);
  });

  const sized = build({ width: "300", height: "700" });
  assert.strictEqual(sized.ok, true);
  assert.ok(sized.code.indexOf('width="300" height="700"') !== -1, "iframe size");
  ["var minWidth = 220;", "var maxWidth = 300;", "var minHeight = 350;", "var maxHeight = 700;"].forEach((line) => {
    assert.ok(sized.code.indexOf("    " + line) !== -1, "script should contain: " + line);
  });
  assert.strictEqual(build({ width: "220", height: "350" }).ok, true, "lower edge is allowed");
  assert.strictEqual(build({ width: "500", height: "1000" }).ok, true, "upper edge is allowed");
}

function testInjectionIsHarmless() {
  const title = build({ title: 'x" onload="alert(1)" data-y=\'<script>alert(2)</script>' });
  assert.strictEqual(title.ok, true);
  assert.ok(title.code.indexOf('onload="') === -1, "a quote in the title must not open a new attribute");
  assert.strictEqual(title.code.split("<script").length - 1, 1, "only the one real script tag");
  assert.strictEqual(title.code.split("</script>").length - 1, 1);

  const link = build({ link: 'https://www.facebook.com/a"onload="x' });
  if (link.ok) {
    assert.ok(link.code.indexOf('"onload') === -1, "a quote in the link must not open a new attribute");
  }
}

function testOnlyFacebookHosts() {
  const built = build({ link: "https://m.facebook.com/townofduck?utm=1" });
  const hosts = built.code.match(/https?:\/\/[^\/"'\s&?]+/g) || [];
  assert.ok(hosts.length > 0);
  hosts.forEach((host) => assert.strictEqual(host, "https://www.facebook.com", "unexpected host in output: " + host));
}

function testScriptBlockCompiles() {
  const built = build();
  const match = /<script>([\s\S]*)<\/script>/.exec(built.code);
  assert.ok(match, "script block present");
  new Function(match[1]);
}

function testRegisteredLikeTheOtherEverywhereTools() {
  const tools = JSON.parse(read("data/on-demand-tools.json").replace(/^﻿/, ""));
  const entry = tools["Facebook Feed Generator"];
  assert.ok(entry, "registered in on-demand-tools.json");
  assert.strictEqual(entry.file, "facebook-feed-generator.js");
  assert.deepStrictEqual(Array.from(entry.urlPatterns), Array.from(tools["Setup Mega Menu"].urlPatterns));
  assert.strictEqual(entry.helpPages, "Everywhere");
  assert.ok(fs.existsSync(path.join(repoRoot, "js/tools/on-demand/" + entry.file)), "file exists");
}

[
  testLinkParsing,
  testRejectsBadLinks,
  testMatchesWorkingReference,
  testOptions,
  testSizeLimits,
  testInjectionIsHarmless,
  testOnlyFacebookHosts,
  testScriptBlockCompiles,
  testRegisteredLikeTheOtherEverywhereTools
].forEach((test) => {
  test();
  console.log("ok - " + test.name);
});
