import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import Color from "color";
import ts from "typescript";

import { colors } from "metabase/ui/colors/colors";
import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import { deriveFullMetabaseTheme } from "metabase/ui/colors/derive-theme";
import { aliases, color } from "metabase/ui/colors/palette";

import { customVizColumnTypes } from "./custom-viz-column-types";

type ColorScheme = "light" | "dark";

type HostContract = {
  contractVersion: number;
  sandbox: Record<string, string[] | string>;
  colors: Record<string, string>;
  columns: Record<string, { column: object; predicates: string[] }>;
};

const CONTRACT_PATH = join(
  __dirname,
  "../../custom-viz/src/host-contract.json",
);
const SANDBOX_DIR = join(
  __dirname,
  "../../../../../frontend/src/metabase/utils/scripts-sandbox",
);

const CONTRACT: HostContract = JSON.parse(readFileSync(CONTRACT_PATH, "utf-8"));

const COLOR_SCHEMES: ColorScheme[] = ["light", "dark"];

const IGNORED_PREDICATES = ["isAny", "hasLatitudeAndLongitudeColumns"];

const HOST_COLOR_NAMES = new Set<string>([
  ...Object.keys(colors),
  ...ALL_COLOR_NAMES,
  ...Object.keys(aliases),
]);

const SANDBOX_FILES = readdirSync(SANDBOX_DIR).filter(
  (file) => file.endsWith(".ts") && !file.includes(".unit.spec."),
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

const findProperty = (file: string, name: string) => {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
};

const readSanitizerList = (name: string) =>
  findProperty("distortions-dom-mutate.ts", name).flatMap(collectStrings);

const readSanitizerPattern = (name: string) =>
  findProperty("distortions-dom-mutate.ts", name)
    .filter(ts.isRegularExpressionLiteral)
    .map((node) => node.text)
    .join("");

const toPattern = (template: string) =>
  template.slice(1, -1).replace(/\$\{(\w+)\}/g, "<$1>");

const readBlockedApiCalls = () => {
  const labels: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "block" &&
      node.arguments.length === 2
    ) {
      const label = node.arguments[1];
      labels.push(
        ts.isStringLiteralLike(label) ? label.text : toPattern(label.getText()),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(parse("distortions-blocked-apis.ts"));
  return labels;
};

const resolveColor = (name: string, colorScheme: ColorScheme) => {
  const theme = deriveFullMetabaseTheme({ colorScheme });
  const palette = Object.fromEntries(
    ALL_COLOR_NAMES.map((key) => [key, theme.colors[key]]),
  );
  return color(name, palette);
};

const getHostPredicates = (kind: string, column: object) =>
  Object.entries(customVizColumnTypes)
    .filter(
      ([name, predicate]) =>
        !IGNORED_PREDICATES.includes(name) &&
        predicate({ name: kind, display_name: kind, source: "", ...column }),
    )
    .map(([name]) => name)
    .sort();

const colorNames = Object.keys(CONTRACT.colors);

const computeContract = (): HostContract => ({
  contractVersion: CONTRACT.contractVersion,
  sandbox: {
    blockedTags: readBlocklist("BLOCKED_TAGS"),
    blockedGlobalEventTypes: readBlocklist("GLOBAL_BLOCKED_EVENT_TYPES"),
    blockedNavigatorGetters: readBlocklist("NAVIGATOR_BLOCKED_GETTERS"),
    urlValuedAttributes: readBlocklist("URL_VALUED_ATTRS"),
    blockedApiCalls: readBlockedApiCalls(),
    sanitizerForbiddenTags: readSanitizerList("FORBID_TAGS"),
    sanitizerForbiddenAttributes: readSanitizerList("FORBID_ATTR"),
    sanitizerAllowedUrlPattern: readSanitizerPattern("ALLOWED_URI_REGEXP"),
  },
  colors: CONTRACT.colors,
  columns: Object.fromEntries(
    Object.entries(CONTRACT.columns).map(([kind, { column }]) => [
      kind,
      { column, predicates: getHostPredicates(kind, column) },
    ]),
  ),
});

describe("custom-viz host-contract.json", () => {
  it("matches the host", () => {
    const expected = computeContract();
    if (JSON.stringify(CONTRACT) !== JSON.stringify(expected)) {
      throw new Error(
        `custom-viz/src/host-contract.json is out of date. Replace it with:\n${JSON.stringify(expected, null, 2)}`,
      );
    }
    expect(
      Object.values(expected.sandbox).every((list) => list.length > 0),
    ).toBe(true);
    expect(colorNames.length).toBeGreaterThan(0);
  });

  it("gives every color a role", () => {
    expect(colorNames.filter((name) => !CONTRACT.colors[name].trim())).toEqual(
      [],
    );
  });

  it("lists only color names the host palette knows", () => {
    expect(colorNames.filter((name) => !HOST_COLOR_NAMES.has(name))).toEqual(
      [],
    );
  });

  it.each(COLOR_SCHEMES)(
    "lists only names that exist as --mb-color CSS variables in the %s theme",
    (colorScheme) => {
      const variables = Object.keys(
        deriveFullMetabaseTheme({ colorScheme }).colors,
      );
      expect(colorNames.filter((name) => !variables.includes(name))).toEqual(
        [],
      );
    },
  );

  it.each(COLOR_SCHEMES)(
    "resolves every listed color to a parseable color in the %s theme",
    (colorScheme) => {
      const unparseable = colorNames.filter((name) => {
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
