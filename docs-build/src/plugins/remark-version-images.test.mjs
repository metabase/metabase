import test from "node:test";
import assert from "node:assert/strict";
import { remarkVersionImages } from "./remark-version-images.mjs";

// Minimal mdast builders — the plugin only touches `image` nodes and reads the
// source file path from vfile.history[0].
function image(url) {
  return { type: "image", url, alt: "" };
}
function root(...children) {
  return { type: "root", children };
}
function run(
  tree,
  { base = "/docs/v0.55", contentDir = "/content", file = "/content/databases/oracle.md" } = {},
) {
  remarkVersionImages({ base, contentDir })(tree, { history: [file] });
  return tree;
}

test("rewrites ./images relative to the file's dir under the content root", () => {
  const tree = root(image("./images/x.png"));
  run(tree);
  assert.equal(tree.children[0].url, "/docs/v0.55/databases/images/x.png");
});

test("resolves ../ segments against the file's directory", () => {
  const tree = root(image("../images/x.png"));
  run(tree, { file: "/content/databases/connections/oracle.md" });
  assert.equal(tree.children[0].url, "/docs/v0.55/databases/images/x.png");
});

test("handles bare relative paths (no leading ./)", () => {
  const tree = root(image("images/x.png"));
  run(tree, { file: "/content/foo.md" });
  assert.equal(tree.children[0].url, "/docs/v0.55/images/x.png");
});

test("normalizes a trailing slash on the base", () => {
  const tree = root(image("./a.png"));
  run(tree, { base: "/docs/v0.55/", file: "/content/x.md" });
  assert.equal(tree.children[0].url, "/docs/v0.55/a.png");
});

test("leaves external and already-absolute URLs untouched", () => {
  for (const url of [
    "https://example.com/a.png",
    "//cdn/a.png",
    "data:image/png;base64,AAAA",
    "/docs/v0.55/images/a.png",
  ]) {
    const tree = root(image(url));
    run(tree);
    assert.equal(tree.children[0].url, url);
  }
});

test("leaves images that resolve outside the content root untouched", () => {
  const tree = root(image("../../../etc/secret.png"));
  run(tree, { file: "/content/a.md" });
  assert.equal(tree.children[0].url, "../../../etc/secret.png");
});

test("ignores non-image nodes and empty urls", () => {
  const tree = root({ type: "link", url: "./images/x.png" }, image(""));
  run(tree);
  assert.equal(tree.children[0].url, "./images/x.png");
  assert.equal(tree.children[1].url, "");
});
