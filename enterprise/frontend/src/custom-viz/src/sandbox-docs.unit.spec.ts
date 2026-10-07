import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SANDBOX_DIR = join(
  __dirname,
  "../../../../../frontend/src/metabase/utils/scripts-sandbox",
);
const RESTRICTIONS = readFileSync(
  join(__dirname, "skill/references/sandbox-restrictions.md"),
  "utf-8",
);

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(join(SANDBOX_DIR, file), "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );

const collectStrings = (node: ts.Node): string[] =>
  ts.isStringLiteralLike(node)
    ? [node.text]
    : node.getChildren().flatMap(collectStrings);

const SANDBOX_FILES = readdirSync(SANDBOX_DIR).filter(
  (file) => file.endsWith(".ts") && !file.includes(".unit.spec."),
);

const readBlocklist = (name: string) => {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found.push(...collectStrings(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  SANDBOX_FILES.forEach((file) => visit(parse(file)));
  return found;
};

const readBlockLabels = () => {
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
  visit(parse("distortions-blocked-apis.ts"));
  return { labels, templates };
};

const sectionOf = (heading: string) => {
  const start = RESTRICTIONS.indexOf(`## ${heading}\n`);
  const end = RESTRICTIONS.indexOf("\n## ", start + 1);
  return start === -1
    ? ""
    : RESTRICTIONS.slice(start, end === -1 ? undefined : end);
};

const codeSpans = (text: string) =>
  new Set([...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]));

const missingFrom = (text: string, items: string[]) => {
  const spans = codeSpans(text);
  return items.filter((item) => !spans.has(item));
};

describe("sandbox-restrictions.md", () => {
  it.each([
    ["BLOCKED_TAGS", "Blocked tags"],
    ["GLOBAL_BLOCKED_EVENT_TYPES", "Blocked global event listeners"],
    ["NAVIGATOR_BLOCKED_GETTERS", "Blocked API calls"],
    ["URL_VALUED_ATTRS", "Blocked attribute assignments"],
  ])("lists every entry of %s under '%s'", (name, heading) => {
    const items = readBlocklist(name);

    expect(items.length).toBeGreaterThan(0);
    expect(missingFrom(sectionOf(heading), items)).toEqual([]);
  });

  it("lists every blocked API label", () => {
    const { labels } = readBlockLabels();

    expect(labels.length).toBeGreaterThan(0);
    expect(missingFrom(sectionOf("Blocked API calls"), labels)).toEqual([]);
  });

  it("documents every computed API label", () => {
    expect(readBlockLabels().templates).toEqual([
      "`Document.set ${handler}`",
      "`window.set ${handler}`",
      "`HTMLBodyElement.set ${handler}`",
      "`HTMLFrameSetElement.set ${handler}`",
      "`Navigator.get ${key}`",
    ]);
    expect(
      missingFrom(sectionOf("Blocked global event listeners"), [
        "Document.set on<type>",
        "window.set on<type>",
        "HTMLBodyElement.set on<type>",
        "HTMLFrameSetElement.set on<type>",
      ]),
    ).toEqual([]);
    expect(
      missingFrom(sectionOf("Blocked API calls"), ["Navigator.get <key>"]),
    ).toEqual([]);
  });

  it("never lists a blocked tag as allowed", () => {
    const blocked = new Set(readBlocklist("BLOCKED_TAGS"));
    const allowed = [...codeSpans(sectionOf("Allowed tags"))];

    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.filter((tag) => blocked.has(tag))).toEqual([]);
  });
});
