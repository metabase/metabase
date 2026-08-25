// Generates frontend/lint/side-effect-files.json by linting the whole tree with `metabase/no-module-side-effects`.
// Without a flag it exits 1 when the registry has drifted, `--update` adds new files as unclassified and drops clean ones, and `--verbose` prints every finding.

const fs = require("fs");
const path = require("path");

const { Linter } = require("eslint");
const micromatch = require("micromatch");
const tseslint = require("typescript-eslint");

const rule = require("../eslint-plugin-metabase/rules/no-module-side-effects");
const {
  NO_MODULE_SIDE_EFFECTS_IGNORES,
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

const RULE_NAME = "metabase/no-module-side-effects";

const LINTER_CONFIG = [
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

function readSource(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
}

function listSourceFiles() {
  return SOURCE_ROOTS.flatMap((root) =>
    fs
      .readdirSync(path.join(REPO_ROOT, root), {
        recursive: true,
        withFileTypes: true,
      })
      .filter(
        (entry) =>
          entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)),
      )
      .map((entry) =>
        path
          .relative(REPO_ROOT, path.join(entry.parentPath, entry.name))
          .replaceAll("\\", "/"),
      ),
  )
    .filter((file) => !micromatch.isMatch(file, NO_MODULE_SIDE_EFFECTS_IGNORES))
    .sort();
}

function scanEffectFiles() {
  const linter = new Linter();
  const findings = new Map();
  for (const file of listSourceFiles()) {
    // The registry records what a file itself does at import, so its imports of other listed files don't count.
    const messages = linter
      .verify(readSource(file), LINTER_CONFIG, {
        filename: path.join(REPO_ROOT, file),
      })
      .filter(
        (message) =>
          message.ruleId === RULE_NAME &&
          message.messageId !== "importsGlobalEffect",
      );
    if (messages.length > 0) {
      findings.set(file, messages);
    }
  }
  return findings;
}

// Listed packages that no source file imports.
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
    const source = readSource(file);
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

// A stale "global" or "entry" entry keeps rejecting imports of a clean file, whereas a stale "self" entry affects nothing.
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
