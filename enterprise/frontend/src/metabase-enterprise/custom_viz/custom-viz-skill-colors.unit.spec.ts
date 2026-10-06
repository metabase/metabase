import { readFileSync } from "fs";
import { join } from "path";

import Color from "color";

import { colors } from "metabase/ui/colors/colors";
import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import { deriveFullMetabaseTheme } from "metabase/ui/colors/derive-theme";
import { aliases, color } from "metabase/ui/colors/palette";

const API_CONTRACT = readFileSync(
  join(__dirname, "../../custom-viz/src/skill/references/api-contract.md"),
  "utf-8",
);

const getColorsSection = () => {
  const start = API_CONTRACT.indexOf("## Colors\n");
  const end = API_CONTRACT.indexOf("\n## ", start + 1);
  return start === -1 ? "" : API_CONTRACT.slice(start, end);
};

const getDocumentedNames = () => {
  const list = getColorsSection()
    .split("\n\n")
    .find((block) => block.startsWith("- "));
  return [...(list ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1]);
};

const HOST_NAMES = new Set<string>([
  ...Object.keys(colors),
  ...ALL_COLOR_NAMES,
  ...Object.keys(aliases),
]);

const COLOR_SCHEMES: ("light" | "dark")[] = ["light", "dark"];

const resolveColor = (name: string, colorScheme: "light" | "dark") => {
  const theme = deriveFullMetabaseTheme({ colorScheme });
  const palette = Object.fromEntries(
    ALL_COLOR_NAMES.map((key) => [key, theme.colors[key]]),
  );
  return color(name, palette);
};

describe("custom-viz skill api-contract.md Colors", () => {
  const names = getDocumentedNames();

  it("lists color names", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it("lists only names the host palette knows", () => {
    expect(names.filter((name) => !HOST_NAMES.has(name))).toEqual([]);
  });

  it.each(COLOR_SCHEMES)(
    "resolves every listed name to a parseable color in the %s theme",
    (colorScheme) => {
      const unparseable = names.filter((name) => {
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
