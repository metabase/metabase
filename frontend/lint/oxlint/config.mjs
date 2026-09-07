import path from "node:path";

import micromatch from "micromatch";

import policy from "../config.mjs";

import defaults from "./rule-defaults.json" with { type: "json" };
import ruleMap from "./rule-map.json" with { type: "json" };

export const root = path.resolve(import.meta.dirname, "../../..");

function merge(left, right) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(result[key] ?? {}, value)
        : value;
  }
  return result;
}

function options(name, value) {
  const [severity, ...supplied] = Array.isArray(value) ? value : [value];
  if (severity === "off" || severity === 0) return "off";
  const result = [...(defaults[name] ?? [])];
  supplied.forEach((value, index) => {
    result[index] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(result[index] ?? {}, value)
        : value;
  });
  return [severity, ...result];
}

// Settings overrides are not supported by oxlint yet. Match the shared policy
// directly instead of recording the files present when the config was generated.
const settingsEntries = policy
  .filter((entry) => entry.settings || entry.languageOptions?.parserOptions)
  .map((entry) => ({
    matches: entry.files
      ? micromatch.matcher(entry.files, { dot: true })
      : () => true,
    settings: entry.settings ?? {},
    parserOptions: entry.languageOptions?.parserOptions ?? {},
  }));
const combinations = new Map();
let lastFile;
let lastSettings;

export function settingsForFile(filename) {
  if (filename === lastFile) return lastSettings;
  const relative = path.relative(root, filename).replaceAll("\\", "/");
  const matched = settingsEntries.flatMap((entry, index) =>
    entry.matches(relative) ? [index] : [],
  );
  const key = matched.join(",");
  if (!combinations.has(key)) {
    combinations.set(
      key,
      matched.reduce(
        (result, index) => ({
          settings: merge(result.settings, settingsEntries[index].settings),
          parserOptions: merge(
            result.parserOptions,
            settingsEntries[index].parserOptions,
          ),
        }),
        { settings: {}, parserOptions: {} },
      ),
    );
  }
  lastFile = filename;
  lastSettings = combinations.get(key);
  return lastSettings;
}

const jsNamespaces = new Set([
  "eslint-js",
  "metabase",
  "cypress",
  "chai-friendly",
  "import-js",
  "react-js",
  "no-only-tests",
  "depend",
  "jest-dom",
  "testing-library",
  "typescript-js",
  "ttag",
  "i18next",
  "boundaries",
  "storybook",
]);

export const jsRules = Object.fromEntries(
  [...jsNamespaces].map((namespace) => [
    namespace,
    [
      ...new Set(
        Object.values(ruleMap)
          .filter((name) => name.startsWith(`${namespace}/`))
          .map((name) => name.slice(namespace.length + 1)),
      ),
    ],
  ]),
);

function glob(pattern) {
  // globset's brace alternatives are equivalent to these simple extglobs.
  return pattern.replace(
    /@\(([^)]+)\)/g,
    (_, alternatives) => `{${alternatives.replaceAll("|", ",")}}`,
  );
}

export function createConfig() {
  const overrides = [];
  const ignorePatterns = [];
  for (const entry of policy) {
    if (entry.ignores && !entry.files) {
      ignorePatterns.push(...entry.ignores);
      continue;
    }
    const rules = {};
    for (const [name, value] of Object.entries(entry.rules ?? {})) {
      // Native unused-vars accounts for JSX references itself.
      if (name === "react/jsx-uses-vars") continue;
      const mapped = ruleMap[name];
      const normalized = options(name, value);
      if (!mapped) {
        if (normalized === "off") continue;
        throw new Error(
          `Map the new lint rule to oxlint or a JS plugin: ${name}`,
        );
      }
      rules[mapped] = normalized;
    }
    const globals = Object.fromEntries(
      Object.entries(entry.languageOptions?.globals ?? {}).map(
        ([name, value]) => [
          name,
          value === false ? "readonly" : value === true ? "writable" : value,
        ],
      ),
    );
    overrides.push({
      files: (entry.files ?? ["**/*"]).map(glob),
      ...(entry.ignores ? { excludeFiles: entry.ignores.map(glob) } : {}),
      ...(Object.keys(globals).length ? { globals } : {}),
      rules,
    });
  }
  return {
    categories: { correctness: "off" },
    plugins: ["typescript", "react", "import", "jest"],
    settings: { react: { version: "18.2.0" } },
    ignorePatterns,
    overrides,
    jsPlugins: [...jsNamespaces].map((name) => ({
      name,
      specifier: path.join(import.meta.dirname, "plugins", `${name}.mjs`),
    })),
  };
}
