/* eslint-disable no-console, metabase/no-unjustified-type-casts, metabase/no-literal-metabase-strings -- build script; casts only narrow package.json and dist imports */
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageDir, "dist");
const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]);
// Only `dependencies` must be used; peers such as react-dom are required by Mantine itself.
const usedPackages = new Set<string>();
// Types-only dependency: referenced by the public .d.ts but never imported at runtime.
const TYPES_ONLY_DEPENDENCIES = new Set(["@tanstack/table-core"]);
// Temporary: /ui stops importing these when Emotion leaves the app; drop them from package.json then.
const TEMPORARY_DEPENDENCIES = new Set(["@emotion/react", "@emotion/cache"]);

// Mantine's ModalBase writes these inline on the modal root.
const MANTINE_OWNED_VARIABLES = new Set([
  "--mb-z-index",
  "--mb-padding",
  "--mb-shadow",
]);

const sideEffectMatchers = (
  (pkg.sideEffects as string[] | boolean) === false
    ? []
    : Array.isArray(pkg.sideEffects)
      ? (pkg.sideEffects as string[])
      : ["**"]
).map((pattern) => {
  const normalized = pattern.replace(/^\.\//, "");
  const glob = new Bun.Glob(
    normalized.includes("/") ? normalized : `**/${normalized}`,
  );
  return (file: string) => glob.match(file);
});
// Export-less leftovers of palette.ts/formatting-colors.ts: pure colour derivation, results unused.
const PURE_EXPORTLESS_MODULES = new Set([
  "dist/src/metabase/ui/colors/palette.js",
  "dist/src/metabase/ui/colors/formatting-colors.js",
]);
const isListedOrKnownPure = (file: string) =>
  PURE_EXPORTLESS_MODULES.has(relative(packageDir, file)) ||
  sideEffectMatchers.some((matches) => matches(relative(packageDir, file)));
const hasExports = (text: string) => /^export\s/m.test(text);

const FORBIDDEN_TYPE_SPECIFIER =
  /^(metabase\/|metabase-types\/|metabase-lib\/|cljs\/|embedding|frontend\/src|\/|[A-Za-z]:[\\/])/;

const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\/\/\/\s*<reference\s+(?:path|types)=["']([^"']+)["']/g,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function specifiers(text: string): string[] {
  return SPECIFIER_PATTERNS.flatMap((re) =>
    [...text.matchAll(re)].map((m) => m[1]),
  );
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const isRelative = (s: string) => s.startsWith("./") || s.startsWith("../");

const errors: string[] = [];
const files = walk(distDir);

for (const file of files) {
  const rel = relative(packageDir, file);
  if (rel.split("/").includes("node_modules")) {
    errors.push(`${rel}: a dependency was bundled into dist`);
    continue;
  }
  if (rel.startsWith("dist/src/") && !rel.startsWith("dist/src/metabase/ui/")) {
    errors.push(
      `${rel}: outside dist/src/metabase/ui/ (a relative import escapes /ui)`,
    );
  }
  const isDts = file.endsWith(".d.ts");
  if (!isDts && !file.endsWith(".js")) {
    continue;
  }
  const text = readFileSync(file, "utf-8");
  if (!isDts) {
    // Barrels get bare imports for ordering only; an export-less target runs purely for its effects.
    for (const [, specifier] of text.matchAll(
      /^import\s*["'](\.[^"']+)["']/gm,
    )) {
      const target = resolve(dirname(file), specifier);
      if (
        target.endsWith(".js") &&
        !isListedOrKnownPure(target) &&
        !hasExports(readFileSync(target, "utf-8"))
      ) {
        errors.push(
          `${rel}: bare import "${specifier}" has side effects but is missing from "sideEffects" in package.json`,
        );
      }
    }
  }
  for (const specifier of specifiers(text)) {
    if (
      !isRelative(specifier) &&
      (!isDts || TYPES_ONLY_DEPENDENCIES.has(packageName(specifier)))
    ) {
      usedPackages.add(packageName(specifier));
    }
    if (/^metabase\/ui(\/|$)/.test(specifier)) {
      errors.push(
        `${rel}: unresolved /ui self-import "${specifier}" (the build must rewrite it to a relative path)`,
      );
    } else if (isDts && FORBIDDEN_TYPE_SPECIFIER.test(specifier)) {
      errors.push(`${rel}: forbidden specifier "${specifier}"`);
    } else if (!isDts && specifier.endsWith(".css")) {
      errors.push(`${rel}: imports CSS "${specifier}"`);
    } else if (
      !isRelative(specifier) &&
      !declared.has(packageName(specifier))
    ) {
      errors.push(
        `${rel}: "${specifier}" is not in dependencies/peerDependencies`,
      );
    }
  }
}

for (const required of ["index.js", "index.d.ts", "styles.css", "fonts.css"]) {
  if (!files.includes(join(distDir, required))) {
    errors.push(`dist/${required} is missing`);
  }
}

const styles = readFileSync(join(distDir, "styles.css"), "utf-8");
const countMatches = (re: RegExp) => [...styles.matchAll(re)].length;
if (
  countMatches(
    /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/g,
  ) !== 1
) {
  errors.push(
    "dist/styles.css must set box-sizing: border-box on * exactly once",
  );
}
if (countMatches(/(^|\n)body,\s*:host\s*\{[^}]*font-family:/g) !== 1) {
  errors.push("dist/styles.css must have a body font-family rule exactly once");
}

if (/\brem\(/.test(styles)) {
  errors.push("dist/styles.css has unprocessed rem(): PostCSS did not run");
}

for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (usedPackages.has(name)) {
    continue;
  }
  if (TEMPORARY_DEPENDENCIES.has(name)) {
    console.warn(`${name}: no longer imported by dist, remove it`);
  } else {
    errors.push(`${name}: declared in dependencies but not imported by dist`);
  }
}

async function checkCssVariables() {
  const providerDir = join(
    distDir,
    "src/metabase/ui/components/theme/MetabaseUIProvider",
  );
  const { PROVIDER_CSS_VARIABLES, COLOR_CSS_VARIABLE_PREFIX } = await import(
    pathToFileURL(join(providerDir, "css-variable-names.js")).href
  );
  const { deriveFullMetabaseTheme } = await import(
    pathToFileURL(join(distDir, "src/metabase/ui/colors/derive-theme.js")).href
  );

  const defined = new Set<string>([
    ...(Object.values(PROVIDER_CSS_VARIABLES) as string[]),
    ...MANTINE_OWNED_VARIABLES,
    ...[...styles.matchAll(/(--mb-[\w-]+)\s*:/g)].map((m) => m[1]),
  ]);
  for (const colorScheme of ["light", "dark"]) {
    for (const name of Object.keys(
      deriveFullMetabaseTheme({ colorScheme }).colors,
    )) {
      defined.add(`${COLOR_CSS_VARIABLE_PREFIX}${name}`);
    }
  }

  const reported = new Set<string>();
  for (const file of files.filter((f) => /\.(js|css)$/.test(f))) {
    // No comma after the name means no fallback.
    const text = readFileSync(file, "utf-8");
    for (const [, name] of text.matchAll(/var\(\s*(--mb-[\w-]+)\s*\)/g)) {
      if (!defined.has(name) && !reported.has(name)) {
        reported.add(name);
        errors.push(
          `${relative(packageDir, file)}: var(${name}) has no fallback and is not defined by styles.css or MetabaseUIProvider`,
        );
      }
    }
  }
}

await checkCssVariables();

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`\ncheck-dist failed with ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`check-dist ok (${files.length} files).`);
