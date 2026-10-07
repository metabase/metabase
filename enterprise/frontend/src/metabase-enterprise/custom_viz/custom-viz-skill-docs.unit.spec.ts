import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import Color from "color";
import ts from "typescript";

import { colors } from "metabase/ui/colors/colors";
import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import { deriveFullMetabaseTheme } from "metabase/ui/colors/derive-theme";
import { aliases, color } from "metabase/ui/colors/palette";

import { customVizColumnTypes } from "./custom-viz-column-types";

const PACKAGE_DIR = join(__dirname, "../../custom-viz");

const readPackageFile = (path: string) =>
  readFileSync(join(PACKAGE_DIR, path), "utf-8");

const COLUMN_PRESETS: Record<string, object> = JSON.parse(
  readPackageFile("src/testing/column-presets.json"),
);
const HOST_DATA: {
  predicates: Record<string, string[]>;
  colors: Record<string, Record<string, string>>;
} = JSON.parse(readPackageFile("src/testing/host-data.json"));
const API_CONTRACT = readPackageFile("src/skill/references/api-contract.md");
const RESTRICTIONS = readPackageFile(
  "src/skill/references/sandbox-restrictions.md",
);
const TESTING_DOC = readPackageFile("src/skill/references/testing.md");
const SANDBOX_DIR = join(
  __dirname,
  "../../../../../frontend/src/metabase/utils/scripts-sandbox",
);

const COLOR_SCHEMES: ("light" | "dark")[] = ["light", "dark"];

const HOST_COLOR_NAMES = new Set<string>([
  ...Object.keys(colors),
  ...ALL_COLOR_NAMES,
  ...Object.keys(aliases),
]);

const sectionOf = (doc: string, heading: string) => {
  const start = doc.indexOf(`## ${heading}\n`);
  const end = doc.indexOf("\n## ", start + 1);
  return start === -1 ? "" : doc.slice(start, end === -1 ? undefined : end);
};

const codeSpans = (text: string) =>
  new Set([...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]));

const missingFrom = (text: string, items: string[]) => {
  const spans = codeSpans(text);
  return items.filter((item) => !spans.has(item));
};

const getDocumentedColorNames = () => {
  const list = sectionOf(API_CONTRACT, "Colors")
    .split("\n\n")
    .find((block) => block.startsWith("- "));
  return [...codeSpans(list ?? "")];
};

const getHostPredicates = (kind: string, preset: object) =>
  Object.entries(customVizColumnTypes)
    .filter(
      ([name, predicate]) =>
        name !== "hasLatitudeAndLongitudeColumns" &&
        predicate({ name: kind, display_name: kind, source: "", ...preset }),
    )
    .map(([name]) => name)
    .sort();

const resolveColor = (name: string, colorScheme: "light" | "dark") => {
  const theme = deriveFullMetabaseTheme({ colorScheme });
  const palette = Object.fromEntries(
    ALL_COLOR_NAMES.map((key) => [key, theme.colors[key]]),
  );
  return color(name, palette);
};

const computeHostData = (colorNames: string[]) => ({
  predicates: Object.fromEntries(
    Object.entries(COLUMN_PRESETS).map(([kind, preset]) => [
      kind,
      getHostPredicates(kind, preset),
    ]),
  ),
  colors: Object.fromEntries(
    COLOR_SCHEMES.map((colorScheme) => [
      colorScheme,
      Object.fromEntries(
        colorNames.map((name) => [name, resolveColor(name, colorScheme)]),
      ),
    ]),
  ),
});

const toComparable = (hostData: typeof HOST_DATA) =>
  JSON.stringify({
    predicates: hostData.predicates,
    colorNames: COLOR_SCHEMES.map((colorScheme) =>
      Object.keys(hostData.colors[colorScheme]),
    ),
  });

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

describe("custom-viz testing host data", () => {
  const documentedColorNames = getDocumentedColorNames();

  it("matches the host predicates and the api-contract.md color names", () => {
    const expected = computeHostData(documentedColorNames);
    if (toComparable(HOST_DATA) !== toComparable(expected)) {
      throw new Error(
        `custom-viz/src/testing/host-data.json is out of date. Replace it with:\n${JSON.stringify(expected, null, 2)}`,
      );
    }
    expect(documentedColorNames.length).toBeGreaterThan(0);
  });

  it("lists only color names the host palette knows", () => {
    expect(
      documentedColorNames.filter((name) => !HOST_COLOR_NAMES.has(name)),
    ).toEqual([]);
  });

  it.each(COLOR_SCHEMES)(
    "lists only names that exist as --mb-color CSS variables in the %s theme",
    (colorScheme) => {
      const variables = Object.keys(
        deriveFullMetabaseTheme({ colorScheme }).colors,
      );
      expect(
        documentedColorNames.filter((name) => !variables.includes(name)),
      ).toEqual([]);
    },
  );

  it.each(COLOR_SCHEMES)(
    "resolves every listed color to a parseable color in the %s theme",
    (colorScheme) => {
      const unparseable = documentedColorNames.filter((name) => {
        try {
          Color(resolveColor(name, colorScheme));
          return false;
        } catch {
          return true;
        }
      });

      expect(unparseable).toEqual([]);
    },
  );
});

describe("sandbox-restrictions.md", () => {
  it.each([
    ["BLOCKED_TAGS", "Blocked tags"],
    ["GLOBAL_BLOCKED_EVENT_TYPES", "Blocked global event listeners"],
    ["NAVIGATOR_BLOCKED_GETTERS", "Blocked API calls"],
    ["URL_VALUED_ATTRS", "Blocked attribute assignments"],
  ])("lists every entry of %s under '%s'", (name, heading) => {
    const items = readBlocklist(name);

    expect(items.length).toBeGreaterThan(0);
    expect(missingFrom(sectionOf(RESTRICTIONS, heading), items)).toEqual([]);
  });

  it("lists every blocked API label", () => {
    const { labels } = readBlockLabels();

    expect(labels.length).toBeGreaterThan(0);
    expect(
      missingFrom(sectionOf(RESTRICTIONS, "Blocked API calls"), labels),
    ).toEqual([]);
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
      missingFrom(sectionOf(RESTRICTIONS, "Blocked global event listeners"), [
        "Document.set on<type>",
        "window.set on<type>",
        "HTMLBodyElement.set on<type>",
        "HTMLFrameSetElement.set on<type>",
      ]),
    ).toEqual([]);
    expect(
      missingFrom(sectionOf(RESTRICTIONS, "Blocked API calls"), [
        "Navigator.get <key>",
      ]),
    ).toEqual([]);
  });

  it("never lists a blocked tag as allowed", () => {
    const blocked = new Set(readBlocklist("BLOCKED_TAGS"));
    const allowed = [...codeSpans(sectionOf(RESTRICTIONS, "Allowed tags"))];

    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.filter((tag) => blocked.has(tag))).toEqual([]);
  });
});

describe("testing.md", () => {
  it("lists every mockColumn kind", () => {
    const prose = TESTING_DOC.replace(/```[\s\S]*?```/g, "");

    expect(missingFrom(prose, Object.keys(COLUMN_PRESETS))).toEqual([]);
  });
});
