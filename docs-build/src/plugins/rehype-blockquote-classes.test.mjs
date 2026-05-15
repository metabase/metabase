import test from "node:test";
import assert from "node:assert/strict";
import { rehypeBlockquoteClasses } from "./rehype-blockquote-classes.mjs";

// Minimal hast builders. The plugin only inspects the first <p>'s first
// <strong>, so we can build very small trees.
function el(tagName, properties, ...children) {
  return { type: "element", tagName, properties: properties || {}, children };
}
function root(...children) {
  return { type: "root", children };
}
function text(value) {
  return { type: "text", value };
}
function strong(value) {
  return el("strong", {}, text(value));
}
function calloutBQ(markerText, body = " and the rest of the note.") {
  return el("blockquote", {}, el("p", {}, strong(markerText), text(body)));
}

function run(tree) {
  rehypeBlockquoteClasses()(tree);
  return tree;
}

function classOf(blockquoteNode) {
  return blockquoteNode.properties?.className;
}

// Recognized markers ----------------------------------------------------------

test("**Tip:** → blockquote.tip", () => {
  const tree = root(calloutBQ("Tip:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["tip"]);
});

test("**Note:** → blockquote.note", () => {
  const tree = root(calloutBQ("Note:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["note"]);
});

test("**Warning:** → blockquote.warning", () => {
  const tree = root(calloutBQ("Warning:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["warning"]);
});

test("**Caution:** → blockquote.warning (alias)", () => {
  const tree = root(calloutBQ("Caution:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["warning"]);
});

test("**Hint:** → blockquote.tip (alias)", () => {
  const tree = root(calloutBQ("Hint:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["tip"]);
});

test("**Danger:** → blockquote.danger", () => {
  const tree = root(calloutBQ("Danger:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["danger"]);
});

test("**Plans:** → blockquote.plans-callout", () => {
  const tree = root(calloutBQ("Plans:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["plans-callout"]);
});

// Colon optional, case-insensitive --------------------------------------------

test("colon is optional — **Tip** alone still matches", () => {
  const tree = root(calloutBQ("Tip"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["tip"]);
});

test("marker matching is case-insensitive", () => {
  const tree = root(calloutBQ("TIP:"));
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["tip"]);
});

// Author intent preserved -----------------------------------------------------

test("blockquote already carrying a *-callout class is left untouched", () => {
  // Authors who hand-write `<blockquote class="plans-callout">` keep control.
  const bq = el(
    "blockquote",
    { className: ["plans-callout"] },
    el("p", {}, strong("Tip:"), text(" overridden by author")),
  );
  const tree = root(bq);
  run(tree);
  assert.deepEqual(classOf(tree.children[0]), ["plans-callout"]);
});

// Non-matching content --------------------------------------------------------

test("unrecognized marker → no class added", () => {
  const tree = root(calloutBQ("Random:"));
  run(tree);
  assert.equal(classOf(tree.children[0]), undefined);
});

test("blockquote with no leading <strong> → no class", () => {
  const tree = root(el("blockquote", {}, el("p", {}, text("just prose, no marker"))));
  run(tree);
  assert.equal(classOf(tree.children[0]), undefined);
});

test("blockquote with no <p> → no class", () => {
  const tree = root(el("blockquote", {}, text("text directly under bq")));
  run(tree);
  assert.equal(classOf(tree.children[0]), undefined);
});

test("non-blockquote elements are ignored", () => {
  const tree = root(el("div", {}, el("p", {}, strong("Tip:"), text(" outside a blockquote"))));
  run(tree);
  assert.equal(classOf(tree.children[0]), undefined);
});
