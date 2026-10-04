import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_DIR = join(__dirname, "..");
const SCRIPT = join(PACKAGE_DIR, "dist", "skill", "verify-tokens.mjs");

const scan = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(PACKAGE_DIR, "dist", "verify-tokens-"));
  Object.entries(files).forEach(([name, source]) =>
    writeFileSync(join(dir, name), source),
  );
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [SCRIPT, join(dir, "index.tsx")],
    { cwd: tmpdir(), encoding: "utf-8" },
  );
  rmSync(dir, { recursive: true, force: true });
  return {
    status,
    output: stdout + stderr,
    findings: [...stderr.matchAll(/blocked in sandbox: (.+)/g)].map(
      ([, finding]) => finding,
    ),
  };
};

describe("verify-tokens.mjs", () => {
  it.each([
    [
      "camelCase SVG tags in JSX",
      "const a = <foreignObject />;\nconst b = <feImage />;",
      ["<foreignObject>", "<feImage>"],
    ],
    [
      "namespaced tags in createElementNS",
      'document.createElementNS("ns", "svg:foreignObject");',
      ["<svg:foreignObject>"],
    ],
    [
      "global listeners regardless of case",
      'window.addEventListener("KeyDown", () => {});',
      ['window.addEventListener("KeyDown")'],
    ],
    [
      "global APIs",
      'fetch("x");\nwindow.localStorage.getItem("k");',
      ["fetch", "localStorage"],
    ],
    [
      "host members",
      "document.cookie;\nnavigator.clipboard;",
      ["Document.cookie", "Navigator.clipboard"],
    ],
    [
      "global event handlers",
      "document.onkeydown = null;\ndocument.body.onpaste = null;\nonkeyup = null;",
      ["document.onkeydown", "document.body.onpaste", "onkeyup"],
    ],
  ])("flags %s", (_, source, expected) => {
    const { status, findings } = scan({ "index.tsx": source });
    expect(findings).toEqual(expected);
    expect(status).toBe(1);
  });

  it.each([
    [
      "same-named methods on own objects",
      "const api = { fetch: () => 1 };\napi.fetch();",
    ],
    [
      "shadowed globals",
      "const run = () => {\n  const open = () => 1;\n  open();\n};",
    ],
    ["comments", '// fetch("x")\nconst x = 1; // fetch("y")'],
    [
      "listeners on own elements",
      'document.createElement("div").addEventListener("keydown", () => {});',
    ],
    ["allowed tags", "const a = <svg><rect /></svg>;"],
    [
      "components named like blocked tags",
      "const Image = () => null;\nconst a = <Image />;\nconst b = <UI.Link />;",
    ],
  ])("does not flag %s", (_, source) => {
    const { status, findings, output } = scan({ "index.tsx": source });
    expect(findings).toEqual([]);
    expect(status).toBe(0);
    expect(output).toContain("verify-tokens: OK");
  });

  it("scans local imports", () => {
    const { findings, output } = scan({
      "index.tsx": 'import "./helper";',
      "helper.ts": 'fetch("x");',
    });
    expect(findings).toEqual(["fetch"]);
    expect(output).toContain("helper.ts");
  });
});
