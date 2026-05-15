import test from "node:test";
import assert from "node:assert/strict";
import { rehypeInternalLinks } from "./rehype-internal-links.mjs";

// Minimal hast builders — keep them inline so the test file is self-contained
// (the production plugin operates on whatever Astro hands it; we mimic the
// shape it cares about).
function el(tagName, properties, ...children) {
  return { type: "element", tagName, properties: properties || {}, children };
}
function root(...children) {
  return { type: "root", children };
}
function link(href, text = "x") {
  return el("a", { href }, { type: "text", value: text });
}

function run(tree, base = "/docs/latest") {
  rehypeInternalLinks({ base })(tree);
  return tree;
}

// .md stripping ---------------------------------------------------------------

test("strips .md suffix from /docs/<version>/... paths", () => {
  const tree = root(link("/docs/latest/foo/bar.md"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "/docs/latest/foo/bar");
});

test("preserves anchor when stripping .md", () => {
  const tree = root(link("/docs/latest/foo/bar.md#section"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "/docs/latest/foo/bar#section");
});

test("drops /index trailing segment", () => {
  const tree = root(link("/docs/latest/foo/index.md"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "/docs/latest/foo/");
});

test("relative .md path: strips .md, leaves the rest unchanged", () => {
  // Astro resolves the resulting relative URL against the current page.
  const tree = root(link("./foo.md"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "./foo");
});

// Base-path rewriting ---------------------------------------------------------

test("swaps the /docs/<version> prefix for the configured base", () => {
  const tree = root(link("/docs/latest/foo/bar.md"));
  run(tree, "/docs/v0.58");
  assert.equal(tree.children[0].properties.href, "/docs/v0.58/foo/bar");
});

test("base path trailing slash is normalized", () => {
  const tree = root(link("/docs/latest/foo.md"));
  run(tree, "/docs/v0.58/");
  assert.equal(tree.children[0].properties.href, "/docs/v0.58/foo");
});

// Pass-through cases ----------------------------------------------------------

test("leaves http/https/mailto/tel/protocol-relative URLs alone", () => {
  for (const href of [
    "https://example.com/path",
    "http://x.test",
    "mailto:a@b.test",
    "tel:+15551234",
    "//cdn.example.com/x",
  ]) {
    const tree = root(link(href));
    run(tree);
    assert.equal(tree.children[0].properties.href, href, `expected ${href} unchanged`);
  }
});

test("leaves fragment-only links alone", () => {
  const tree = root(link("#in-page"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "#in-page");
});

test("leaves /learn/ cross-site links alone", () => {
  const tree = root(link("/learn/sql-basics"));
  run(tree);
  assert.equal(tree.children[0].properties.href, "/learn/sql-basics");
});

test("leaves empty href untouched", () => {
  const tree = root(link(""));
  run(tree);
  assert.equal(tree.children[0].properties.href, "");
});

// Non-anchor elements ---------------------------------------------------------

test("non-anchor elements are not rewritten", () => {
  const tree = root(el("img", { src: "/docs/latest/foo/bar.md" }));
  run(tree);
  assert.equal(tree.children[0].properties.src, "/docs/latest/foo/bar.md");
});
