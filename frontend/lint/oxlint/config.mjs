import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";

import micromatch from "micromatch";

import policy from "../config.mjs";
import { boundarySettings, boundaryOptions } from "../module-boundaries.mjs";

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

// Oxlint does not apply per-file settings overrides.
const settingsEntries = policy
  .filter(
    (entry) =>
      entry.settings ||
      entry.languageOptions?.parserOptions ||
      entry.languageOptions?.sourceType,
  )
  .map((entry) => ({
    matches: entry.files
      ? micromatch.matcher(entry.files, { dot: true })
      : () => true,
    sourceType: entry.languageOptions?.sourceType,
    settings: entry.settings ?? {},
    parserOptions: entry.languageOptions?.parserOptions ?? {},
  }));
// The resolver keys its WeakMaps by settings identity.
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
          sourceType: settingsEntries[index].sourceType ?? result.sourceType,
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

const nativePlugins = ["typescript", "react", "import", "jest"];
const jsNamespaces = [
  ...new Set(
    Object.values(ruleMap)
      .filter((name) => name.includes("/"))
      .map((name) => name.slice(0, name.indexOf("/"))),
  ),
].filter((name) => !nativePlugins.includes(name));

export const jsRules = Object.fromEntries(
  jsNamespaces
    .filter((name) => name !== "no-only-tests")
    .map((namespace) => [
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

const require = createRequire(import.meta.url);
function hasCssModulesPlugin() {
  if (!(process.env.CI || process.env.LINT_CSS_MODULES === "true"))
    return false;
  try {
    require.resolve("eslint-plugin-postcss-modules");
    return true;
  } catch {
    return false;
  }
}

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
    for (const [name, value] of Object.entries(entry.settings ?? {})) {
      if (
        name.startsWith("boundaries/") &&
        (!Object.hasOwn(boundarySettings, name) ||
          !isDeepStrictEqual(value, boundarySettings[name]))
      ) {
        throw new Error(`Unsupported boundary checker setting: ${name}`);
      }
    }
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
      if (
        name === "boundaries/element-types" &&
        normalized !== "off" &&
        !isDeepStrictEqual(normalized.slice(1), [boundaryOptions])
      ) {
        throw new Error(
          "The boundary checker requires the shared enforced policy",
        );
      }
      if (!mapped) {
        if (normalized === "off") continue;
        throw new Error(
          `Map the new lint rule to oxlint or a JS plugin: ${name}`,
        );
      }
      // A TypeScript extension can share its native rule with the disabled ESLint base rule.
      const extension = `@typescript-eslint/${name}`;
      if (
        normalized === "off" &&
        ruleMap[extension] === mapped &&
        Object.hasOwn(entry.rules, extension)
      )
        continue;
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
  const namespaces = [...jsNamespaces];
  if (hasCssModulesPlugin()) {
    jsRules["postcss-modules"] = ["no-undef-class"];
    namespaces.push("postcss-modules");
    overrides.push({
      files: ["**/*.{js,jsx,ts,tsx}"],
      rules: { "postcss-modules/no-undef-class": "error" },
    });
  }
  return {
    categories: { correctness: "off" },
    plugins: nativePlugins,
    settings: { react: { version: "18.2.0" } },
    ignorePatterns,
    overrides,
    jsPlugins: namespaces.map((name) => ({
      name,
      specifier: path.join(import.meta.dirname, "plugins", `${name}.mjs`),
    })),
  };
}
