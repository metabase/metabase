import { readFileSync } from "fs";
import { join } from "path";

import Color from "color";

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

const COLOR_SCHEMES: ("light" | "dark")[] = ["light", "dark"];

const HOST_COLOR_NAMES = new Set<string>([
  ...Object.keys(colors),
  ...ALL_COLOR_NAMES,
  ...Object.keys(aliases),
]);

const getDocumentedColorNames = () => {
  const start = API_CONTRACT.indexOf("## Colors\n");
  const end = API_CONTRACT.indexOf("\n## ", start + 1);
  const list = API_CONTRACT.slice(start, end)
    .split("\n\n")
    .find((block) => block.startsWith("- "));
  return [...(list ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1]);
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
