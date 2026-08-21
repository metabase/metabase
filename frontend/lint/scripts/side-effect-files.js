/**
 * @fileoverview Keeps frontend/lint/side-effect-files.json in step with the source tree.
 * The registry lists every source file that `metabase/no-module-side-effects` reports under the options
 * eslint.config.mjs gives it, so this scans the tree with just that rule and compares.
 *
 *   bun frontend/lint/scripts/side-effect-files.js --check    exit 1 on drift, listing it
 *   bun frontend/lint/scripts/side-effect-files.js --update   add new files as unclassified, drop clean ones
 *   bun frontend/lint/scripts/side-effect-files.js --verbose  also print every finding
 */

const fs = require("fs");
const path = require("path");

const { Linter } = require("eslint");
const micromatch = require("micromatch");
const tseslint = require("typescript-eslint");

const rule = require("../eslint-plugin-metabase/rules/no-module-side-effects");
const {
  NO_MODULE_SIDE_EFFECTS_OPTIONS,
} = require("../no-module-side-effects-options");
const {
  DEFAULT_REGISTRY_PATH,
  classify,
  loadRegistry,
  validateRegistry,
} = require("../side-effect-registry");

const REPO_ROOT = path.resolve(__dirname, "../../..");

const SOURCE_ROOTS = ["frontend/src", "enterprise/frontend/src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
// The same files eslint.config.mjs leaves out of the rule.
const IGNORED_PATTERNS = [
  "**/*.unit.spec.*",
  "**/*.stories.*",
  "**/tests/**",
  "**/__support__/**",
  "**/*.d.ts",
];

const RULE_NAME = "metabase/no-module-side-effects";

function listSourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.relative(REPO_ROOT, entryPath).replaceAll("\\", "/"));
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    walk(path.join(REPO_ROOT, root));
  }
  return files
    .filter((file) => !micromatch.isMatch(file, IGNORED_PATTERNS))
    .sort();
}

function createLinter() {
  const linter = new Linter();
  const config = [
    {
      files: ["**/*.{ts,tsx,js,jsx}"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
        sourceType: "module",
      },
      plugins: { metabase: { rules: { "no-module-side-effects": rule } } },
      rules: { [RULE_NAME]: ["error", NO_MODULE_SIDE_EFFECTS_OPTIONS] },
    },
  ];
  return (file) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    // The registry records what a file does at import, so its imports of other effect files do not count.
    return linter
      .verify(source, config, { filename: path.join(REPO_ROOT, file) })
      .filter(
        (message) =>
          message.ruleId === RULE_NAME &&
          message.messageId !== "importsGlobalEffect",
      );
  };
}

// Repo-relative path -> messages, for every source file the rule reports.
function scanEffectFiles() {
  const lint = createLinter();
  const findings = new Map();
  for (const file of listSourceFiles()) {
    const messages = lint(file);
    if (messages.length > 0) {
      findings.set(file, messages);
    }
  }
  return findings;
}

// Listed packages that no source file imports, so the list cannot keep dead entries.
// A specifier is imported when it appears quoted, alone or with a subpath, anywhere in a source file.
function unimportedPackages(registry, files) {
  const unseen = new Map(
    Object.keys(registry.packages).map((specifier) => [
      specifier,
      new RegExp(`["'\`]${escapeRegExp(specifier)}(/[^"'\`]*)?["'\`]`),
    ]),
  );
  for (const file of files) {
    if (unseen.size === 0) {
      break;
    }
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const [specifier, pattern] of unseen) {
      if (pattern.test(source)) {
        unseen.delete(specifier);
      }
    }
  }
  return [...unseen.keys()];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// { missing: effect files the registry does not list, stale: exact entries whose file is clean }
function diffRegistry(registry, effectFiles) {
  const effectSet = new Set(effectFiles);
  const missing = effectFiles.filter(
    (file) => classify(registry, file) == null,
  );
  const stale = [
    ...Object.keys(registry.files).filter((key) => !key.includes("*")),
    ...registry.unclassified,
  ].filter((file) => !effectSet.has(file));
  return { missing, stale };
}

// The stale entries the registry spec fails on: the rule rejects imports of a file classified
// "global" or "entry", so a stale entry keeps rejecting imports of a file that is now clean,
// while a stale "self" entry affects nothing and can wait for an --update sweep.
function enforcedStale(registry, stale) {
  return stale.filter((file) => classify(registry, file) !== "self");
}

function updateRegistry(registryPath, { missing, stale }) {
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const staleSet = new Set(stale);
  const files = Object.fromEntries(
    Object.entries(raw.files || {}).filter(([key]) => !staleSet.has(key)),
  );
  const unclassified = [
    ...(raw.unclassified || []).filter((file) => !staleSet.has(file)),
    ...missing,
  ].sort();
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({ ...raw, files, unclassified }, null, 2)}\n`,
  );
}

/* eslint-disable no-console */
function main(argv) {
  const started = Date.now();
  const findings = scanEffectFiles();
  const effectFiles = [...findings.keys()];
  const registry = loadRegistry(DEFAULT_REGISTRY_PATH);
  const diff = diffRegistry(registry, effectFiles);
  const problems = [
    ...validateRegistry(registry, effectFiles),
    ...unimportedPackages(registry, listSourceFiles()).map(
      (specifier) => `packages: nothing imports "${specifier}"`,
    ),
  ];
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${effectFiles.length} files with import-time effects (${seconds}s)`,
  );
  if (argv.includes("--verbose")) {
    for (const [file, messages] of findings) {
      console.log(`  ${file}`);
      for (const message of messages) {
        console.log(`    ${message.line}: ${message.message}`);
      }
    }
  }
  if (argv.includes("--update")) {
    updateRegistry(DEFAULT_REGISTRY_PATH, diff);
    console.log(
      `added ${diff.missing.length} as unclassified, removed ${diff.stale.length}`,
    );
    return 0;
  }
  for (const problem of problems) {
    console.log(`invalid: ${problem}`);
  }
  for (const file of diff.missing) {
    console.log(`missing: ${file}`);
  }
  for (const file of diff.stale) {
    console.log(`clean:   ${file}`);
  }
  const drifted = problems.length + diff.missing.length + diff.stale.length;
  if (drifted > 0) {
    console.log(
      "\nregistry out of date. Run: bun frontend/lint/scripts/side-effect-files.js --update",
    );
  }
  return drifted > 0 ? 1 : 0;
}

module.exports = {
  listSourceFiles,
  scanEffectFiles,
  diffRegistry,
  enforcedStale,
  unimportedPackages,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
