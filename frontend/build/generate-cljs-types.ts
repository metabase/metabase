import fs from "node:fs";
import { join } from "node:path";

const BUILD_DIR = "target/cljs_dev";
const TYPES_DIR = "frontend/src/types/cljs";
const HEADER =
  "// Generated from the cljs build by `bun run generate:cljs-types`. Commit what it changes.";

export function parseEntryModuleNames(shadowConfig: string): string[] {
  const [, entries = ""] =
    shadowConfig.replace(/;.*$/gm, "").match(/:entries\s*\[([^\]]*)\]/) ?? [];
  return entries
    .split(/[\s,]+/)
    .filter((namespace) => namespace.length > 0)
    .map((namespace) => namespace.replaceAll("-", "_"));
}

export function extractExportNames(compiledSource: string): string[] {
  return Array.from(
    compiledSource.matchAll(
      /Object\.defineProperty\(module\.exports, "([^"]+)"/g,
    ),
    ([, name]) => name,
  ).sort();
}

export function renderDeclarations(exportNames: readonly string[]): string {
  const lines =
    exportNames.length > 0
      ? exportNames.map((name) => `export const ${name}: any;`)
      : ["export {};"];
  return [HEADER, ...lines, ""].join("\n");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readFileIfExists(path: string): string | null {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : null;
}

function generateCljsTypes(check: boolean) {
  const shadowConfig = fs.readFileSync("shadow-cljs.edn", "utf8");
  const entries = parseEntryModuleNames(shadowConfig).map(
    (moduleName): [string, string[]] => {
      const compiledPath = `${BUILD_DIR}/${moduleName}.js`;
      const compiledSource =
        readFileIfExists(compiledPath) ??
        fail(
          `This needs a cljs build, and ${compiledPath} is missing. Run \`bun run build:cljs\` first.`,
        );
      return [moduleName, extractExportNames(compiledSource)];
    },
  );
  if (entries.every(([, exportNames]) => exportNames.length === 0)) {
    fail(`Found no exports in the compiled entries in ${BUILD_DIR}.`);
  }

  const contentByPath = new Map<string, string | null>([
    ...fs
      .readdirSync(TYPES_DIR)
      .filter((fileName) => fileName.endsWith(".d.ts"))
      .sort()
      .map((fileName): [string, null] => [`${TYPES_DIR}/${fileName}`, null]),
    ...entries.map(([moduleName, exportNames]): [string, string] => [
      `${TYPES_DIR}/${moduleName}.d.ts`,
      renderDeclarations(exportNames),
    ]),
  ]);
  const outOfDate = [...contentByPath].filter(
    ([path, content]) => readFileIfExists(path) !== content,
  );

  if (check && outOfDate.length > 0) {
    console.error("These cljs type declarations don't match the build:");
    outOfDate.forEach(([path]) => console.error(`  ${path}`));
    fail("Run `bun run generate:cljs-types` and commit the result.");
  }
  if (!check) {
    outOfDate.forEach(([path, content]) => {
      if (content === null) {
        fs.rmSync(path);
      } else {
        fs.writeFileSync(path, content);
      }
      process.stdout.write(`Updated ${path}\n`);
    });
  }
}

if (require.main === module) {
  process.chdir(join(__dirname, "../.."));
  generateCljsTypes(process.argv.includes("--check"));
}
