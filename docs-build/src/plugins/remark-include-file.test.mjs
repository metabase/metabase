import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { remarkIncludeFile } from "./remark-include-file.mjs";

function parse(md) {
  return fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

// `consumerPath` need not exist on disk — the plugin only uses its dirname to
// resolve `{{ dirname }}`.
function run(md, consumerPath) {
  const tree = parse(md);
  const messages = [];
  const file = { history: [consumerPath], message: (m) => messages.push(String(m)) };
  remarkIncludeFile()(tree, file);
  return { tree, messages };
}

function makeFixtures(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "incfile-"));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

test("splices a .md snippet as mdast so headings/tables flow through", () => {
  const dir = makeFixtures({
    "snip.md": [
      "before",
      "<!-- [<snippet props>] -->",
      "### Properties",
      "",
      "| name | type   |",
      "| ---- | ------ |",
      "| id   | number |",
      "<!-- [<endsnippet props>] -->",
      "after",
    ].join("\n"),
  });
  const md = `## Props\n\n{% include_file "{{ dirname }}/snip.md" snippet="props" %}\n\n## Next`;
  const { tree, messages } = run(md, path.join(dir, "consumer.md"));
  assert.equal(messages.length, 0);
  assert.deepEqual(
    tree.children.map((n) => n.type),
    ["heading", "heading", "table", "heading"],
  );
  assert.equal(tree.children[1].depth, 3);
});

test("source-code snippet becomes a fenced code node, dedented, lang from ext", () => {
  const dir = makeFixtures({
    "ex.tsx": [
      'import x from "y";',
      "// [<snippet example>]",
      "    const a = 1;",
      "    const b = 2;",
      "// [<endsnippet example>]",
      "export default a;",
    ].join("\n"),
  });
  const md = `text\n\n{% include_file "{{ dirname }}/ex.tsx" snippet="example" %}\n\nmore`;
  const { tree, messages } = run(md, path.join(dir, "consumer.md"));
  assert.equal(messages.length, 0);
  const code = tree.children.find((n) => n.type === "code");
  assert.ok(code, "expected a code node");
  assert.equal(code.lang, "tsx");
  assert.equal(code.value, "const a = 1;\nconst b = 2;");
});

test("whole-file include (no snippet) inside a code fence keeps the fence language", () => {
  const dir = makeFixtures({ "f.ts": "export const z = 42;\n" });
  const md = "```ts\n{% include_file \"{{ dirname }}/f.ts\" %}\n```";
  const { tree, messages } = run(md, path.join(dir, "consumer.md"));
  assert.equal(messages.length, 0);
  const code = tree.children.find((n) => n.type === "code");
  assert.equal(code.lang, "ts");
  assert.match(code.value, /export const z = 42;/);
});

test("missing file → placeholder blockquote + warning, build not failed", () => {
  const dir = makeFixtures({});
  const md = `x\n\n{% include_file "{{ dirname }}/nope.tsx" %}\n\ny`;
  const { tree, messages } = run(md, path.join(dir, "consumer.md"));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /cannot read/);
  const html = tree.children.find((n) => n.type === "html");
  assert.ok(html && /reference snippet/.test(html.value));
});

test("missing snippet name → placeholder + warning", () => {
  const dir = makeFixtures({ "s.md": "no markers here" });
  const md = `x\n\n{% include_file "{{ dirname }}/s.md" snippet="ghost" %}\n\ny`;
  const { messages } = run(md, path.join(dir, "consumer.md"));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /snippet "ghost" not found/);
});
