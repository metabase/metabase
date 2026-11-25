/* eslint-disable no-console, metabase/no-literal-metabase-strings -- build script */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";

import { isAllowedSourceFile } from "./app-allowlist";
import { readPackageJson } from "./package-json";

const packageDir = resolve(import.meta.dirname, "..");
const distDir = join(packageDir, "dist");
const pkg = readPackageJson(join(packageDir, "package.json"));

const POPOVER_REGISTRATION =
  "dist/src/metabase/ui/components/overlays/Popover/register-popover-dropdown.js";
// Registers the Day.js plugins on import, like the app does.
const DAYJS_SETUP = "dist/src/metabase/dayjs/index.js";
const REQUIRED_FILES = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/styles.css",
  "dist/fonts.css",
  "dist/mantine-core-LICENSE.txt",
  "dist/mantine-dates-LICENSE.txt",
  "dist/fonts/Lato/OFL.txt",
  "dist/fonts/Lato/lato-v16-latin-regular.woff2",
  "dist/fonts/Lato/lato-v16-latin-700.woff2",
  "dist/fonts/Lato/lato-v16-latin-900.woff2",
  "dist/fonts/Lato/lato-v16-latin-regular.woff",
  "dist/fonts/Lato/lato-v16-latin-700.woff",
  "dist/fonts/Lato/lato-v16-latin-900.woff",
  POPOVER_REGISTRATION,
  DAYJS_SETUP,
];
// Types-only dependency: referenced by the public .d.ts but never imported at runtime.
const TYPES_ONLY = new Set(["@tanstack/table-core"]);

const REPO_SPECIFIER =
  /^(metabase\/|metabase-types\/|metabase-lib\/|cljs\/|embedding|__support__)/;
const UNTYPED_DECLARATION = /^\s*(export )?(declare )?(var|let|const) \w+;$/m;
const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\/\/\/\s*<reference\s+path=["']([^"']+)["']/g,
];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const packageName = (specifier: string) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]);
const usedDependencies = new Set<string>();
const errors: string[] = [];
// dist/src/** and dist/types/src/** mirror frontend/src/**; dist/ui-package/** and
// dist/types/ui-package/** mirror frontend/ui-package/**.
function sourceCandidates(rel: string) {
  const match = rel.match(
    /^dist\/(?:types\/)?((?:src|ui-package)\/.+?)(?:\.d\.ts|\.js)$/,
  );
  return match
    ? SOURCE_EXTENSIONS.map((ext) => resolve(packageDir, "..", match[1] + ext))
    : [];
}

// Node's ESM resolver and NodeNext need the extension, and a file that exists on disk.
function relativeSpecifierError(rel: string, specifier: string) {
  const target = resolve(dirname(join(packageDir, rel)), specifier);
  if (!/\.\w+$/.test(specifier)) {
    return `${rel}: relative specifier "${specifier}" has no file extension`;
  }
  const onDisk =
    rel.endsWith(".d.ts") && specifier.endsWith(".js")
      ? target.replace(/\.js$/, ".d.ts")
      : target;
  if (!existsSync(onDisk) || statSync(onDisk).isDirectory()) {
    return `${rel}: relative specifier "${specifier}" does not point to an existing file`;
  }
}

const files = walk(distDir).map((file) => relative(packageDir, file));

for (const required of REQUIRED_FILES) {
  if (!existsSync(join(packageDir, required))) {
    errors.push(`${required} is missing`);
  }
}
for (const module of [POPOVER_REGISTRATION, DAYJS_SETUP]) {
  if (!pkg.sideEffects?.includes(`./${module}`)) {
    errors.push(`package.json sideEffects must contain "./${module}"`);
  }
}

for (const rel of files) {
  if (rel.split("/").includes("node_modules")) {
    errors.push(`${rel}: a dependency was bundled into dist`);
  }
  if (!/\.(js|d\.ts)$/.test(rel)) {
    continue;
  }
  const isDts = rel.endsWith(".d.ts");
  if (
    /^dist\/(types\/)?(src|ui-package)\//.test(rel) &&
    !sourceCandidates(rel).some(isAllowedSourceFile)
  ) {
    errors.push(`${rel}: not built from an allowed source file`);
  }
  const text = readFileSync(join(packageDir, rel), "utf-8");
  // metabase/dayjs loads locales with a dynamic require, which must not reach an ESM package.
  if (!isDts && /\brequire\(/.test(text)) {
    errors.push(`${rel}: contains a require() call`);
  }
  if (isDts && UNTYPED_DECLARATION.test(text)) {
    errors.push(`${rel}: untyped declaration (implicit any)`);
  }
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const [, specifier] of text.matchAll(pattern)) {
      if (specifier.startsWith(".")) {
        const error = relativeSpecifierError(rel, specifier);
        if (error) {
          errors.push(error);
        }
        continue;
      }
      if (REPO_SPECIFIER.test(specifier)) {
        errors.push(`${rel}: unresolved repo specifier "${specifier}"`);
      } else if (!declared.has(packageName(specifier))) {
        errors.push(`${rel}: "${specifier}" is not a declared dependency`);
      } else if (!isDts || TYPES_ONLY.has(packageName(specifier))) {
        usedDependencies.add(packageName(specifier));
      }
    }
  }
}

for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (!usedDependencies.has(name)) {
    errors.push(`${name}: declared in dependencies but not imported by dist`);
  }
}

const entry = readFileSync(join(distDir, "index.js"), "utf-8");
if (!/export\s*\{[^}]*\bMetabaseUIProvider\b/.test(entry)) {
  errors.push("dist/index.js does not export MetabaseUIProvider");
}

// Mantine's baseline is patched out of @mantine/core/styles.css; it must ship exactly once.
const styles = readFileSync(join(distDir, "styles.css"), "utf-8");
const baselines = styles.split("color-scheme: var(--mantine-color-scheme)");
if (baselines.length !== 2) {
  errors.push(
    `dist/styles.css has the baseline ${baselines.length - 1} times, expected 1`,
  );
}

if (errors.length > 0) {
  console.error(
    `${errors.join("\n")}\n\ncheck-dist: ${errors.length} problem(s)`,
  );
  process.exit(1);
}
console.log(`check-dist ok (${files.length} files).`);
