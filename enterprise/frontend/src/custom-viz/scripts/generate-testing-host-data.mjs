import console from "node:console";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(PACKAGE_DIR, "../../../..");
const PRESETS_PATH = join(PACKAGE_DIR, "src/testing/column-presets.json");
const API_CONTRACT_PATH = join(
  PACKAGE_DIR,
  "src/skill/references/api-contract.md",
);
const OUTPUT_PATH = join(PACKAGE_DIR, "src/testing/host-data.json");
const COLOR_SCHEMES = ["light", "dark"];

const repoRequire = createRequire(join(REPO_DIR, "package.json"));

const HOST_ENTRY = `
import { customVizColumnTypes } from "metabase-enterprise/custom_viz/custom-viz-column-types";
import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import { deriveFullMetabaseTheme } from "metabase/ui/colors/derive-theme";
import { color } from "metabase/ui/colors/palette";

export const columnTypes = customVizColumnTypes;

export const resolveColor = (name, colorScheme) => {
  const theme = deriveFullMetabaseTheme({ colorScheme });
  const palette = Object.fromEntries(
    ALL_COLOR_NAMES.map((key) => [key, theme.colors[key]]),
  );
  return color(name, palette);
};
`;

const loadHost = async () => {
  const { build } = repoRequire("esbuild");
  const outfile = join(
    mkdtempSync(join(tmpdir(), "custom-viz-host-")),
    "host.cjs",
  );
  await build({
    stdin: { contents: HOST_ENTRY, resolveDir: REPO_DIR, loader: "ts" },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    tsconfig: join(REPO_DIR, "tsconfig.json"),
    loader: { ".css": "empty" },
    logLevel: "error",
  });
  return createRequire(outfile)(outfile);
};

const readDocumentedColorNames = () => {
  const text = readFileSync(API_CONTRACT_PATH, "utf-8");
  const start = text.indexOf("## Colors\n");
  const end = text.indexOf("\n## ", start + 1);
  const list = text
    .slice(start, end)
    .split("\n\n")
    .find((block) => block.startsWith("- "));
  return [...(list ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1]);
};

const computePredicates = (columnTypes, presets) => {
  const predicateNames = Object.keys(columnTypes).filter(
    (name) => name !== "hasLatitudeAndLongitudeColumns",
  );
  return Object.fromEntries(
    Object.entries(presets).map(([kind, preset]) => [
      kind,
      predicateNames
        .filter((name) =>
          columnTypes[name]({ name: kind, display_name: kind, ...preset }),
        )
        .sort(),
    ]),
  );
};

const computeColors = (resolveColor, names) =>
  Object.fromEntries(
    COLOR_SCHEMES.map((colorScheme) => [
      colorScheme,
      Object.fromEntries(
        names.map((name) => [name, resolveColor(name, colorScheme)]),
      ),
    ]),
  );

const main = async () => {
  const { columnTypes, resolveColor } = await loadHost();
  const presets = JSON.parse(readFileSync(PRESETS_PATH, "utf-8"));
  const hostData = {
    predicates: computePredicates(columnTypes, presets),
    colors: computeColors(resolveColor, readDocumentedColorNames()),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(hostData, null, 2)}\n`);
  console.log(`wrote ${OUTPUT_PATH}`);
};

await main();
