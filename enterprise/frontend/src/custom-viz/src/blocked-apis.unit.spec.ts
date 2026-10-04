import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SKILL_DIR = join(__dirname, "..", "dist", "skill");
const DISTORTIONS_FILE = join(
  __dirname,
  "../../../../../frontend/src/metabase/utils/scripts-sandbox/distortions-blocked-apis.ts",
);

const readBlockLabels = () => {
  const file = ts.createSourceFile(
    DISTORTIONS_FILE,
    readFileSync(DISTORTIONS_FILE, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const labels: string[] = [];
  const templates: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "block" &&
      node.arguments.length === 2
    ) {
      const label = node.arguments[1];
      if (ts.isStringLiteralLike(label)) {
        labels.push(label.text);
      } else {
        templates.push(label.getText());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { labels, templates };
};

const collectLibApiNames = () => {
  const program = ts.createProgram([__filename], {
    target: ts.ScriptTarget.Latest,
    noResolve: true,
  });
  program.getTypeChecker();
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(
        ts.isInterfaceDeclaration(node.parent)
          ? `${node.parent.name.text}.${node.name.text}`
          : node.name.text,
      );
    }
    ts.forEachChild(node, visit);
  };
  program
    .getSourceFiles()
    .filter((file) => program.isSourceFileDefaultLibrary(file))
    .forEach(visit);
  return names;
};

describe("skill blocked-apis.mjs", () => {
  it("maps every API blocked by the sandbox", async () => {
    const { SANDBOX_BLOCKED_APIS } = await import(
      join(SKILL_DIR, "blocked-apis.mjs")
    );
    const { labels } = readBlockLabels();

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => !(label in SANDBOX_BLOCKED_APIS))).toEqual(
      [],
    );
  });

  it("names APIs the way verify-tokens resolves them from the TS lib", async () => {
    const { SANDBOX_BLOCKED_APIS } = await import(
      join(SKILL_DIR, "blocked-apis.mjs")
    );
    const libApiNames = collectLibApiNames();
    const values: string[] = [
      ...new Set<string>(Object.values(SANDBOX_BLOCKED_APIS)),
    ];

    expect(
      values.filter(
        (value) => !value.startsWith("document.") && !libApiNames.has(value),
      ),
    ).toEqual([
      "onbeforepaste",
      "onbeforecopy",
      "onbeforecut",
      "oncompositionstart",
      "oncompositionupdate",
      "oncompositionend",
      "Navigator.usb",
      "Navigator.bluetooth",
      "Navigator.hid",
      "Navigator.serial",
      "Navigator.xr",
      "Navigator.presentation",
    ]);
  });

  it("knows every computed sandbox label", () => {
    expect(readBlockLabels().templates).toEqual([
      "`Document.set ${handler}`",
      "`window.set ${handler}`",
      "`HTMLBodyElement.set ${handler}`",
      "`HTMLFrameSetElement.set ${handler}`",
      "`Navigator.get ${key}`",
    ]);
  });
});
