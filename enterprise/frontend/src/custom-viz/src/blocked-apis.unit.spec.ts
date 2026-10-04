import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SKILL_DIR = join(__dirname, "..", "dist", "skill");
const DISTORTIONS_FILE = join(
  SKILL_DIR,
  "references",
  "distortions-blocked-apis.ts",
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
