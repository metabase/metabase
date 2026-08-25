// eslint-plugin-boundaries caches its normalized settings and element matchers
// keyed by the *identity* of the merged `context.settings` object (WeakMaps in
// Elements.js / Settings.js). ESLint's flat config deep-merges settings into a
// fresh top-level object for every combination of matching config blocks, so
// with per-source boundary configs (~137 combinations in the corpus) the
// plugin rebuilds its matcher — descriptor normalizations plus pattern setup —
// once per combination, all of it landing on whichever boundaries rule runs
// first (`no-unknown-files`).
//
// This wrapper canonicalizes `context.settings` to one shared object whenever
// two merged settings objects are indistinguishable to every consumer:
//
// - `boundaries/*` keys: the plugin only reads these. ESLint's deep merge
//   preserves the reference identity of arrays, so element/ignore/dependency
//   arrays are fingerprinted by reference; scalars by value; the rare plain
//   object setting by JSON.
// - every other key: the plugin's dependency resolution goes through
//   eslint-module-utils, which reads `import/*` resolver settings from the
//   SAME context. These genuinely differ per config area (e.g. the embedding
//   SDK rspack config), so they are compared by value and included in the
//   fingerprint. Only settings that match on both parts share a canonical
//   object, keeping resolver configuration correct per file.
//
// A WeakMap keyed on the raw merged object keeps fingerprinting to one call
// per distinct settings object. The plugin's rules run unmodified.

const canonicalByRawSettings = new WeakMap();
const canonicalByFingerprint = new Map();
const refIds = new WeakMap();
let nextRefId = 0;

const refId = (value) => {
  let id = refIds.get(value);
  if (id === undefined) {
    id = ++nextRefId;
    refIds.set(value, id);
  }
  return id;
};

// Fingerprint of one `boundaries/*` entry.
const boundaryKeyFingerprint = (key, value) => {
  if (value !== null && typeof value === "object") {
    return Array.isArray(value)
      ? `${key}#${refId(value)}`
      : `${key}:${JSON.stringify(value)}`;
  }
  return `${key}=${String(value)}`;
};

// Two merged settings objects are interchangeable when their `boundaries/*`
// entries are identical (by reference or value) and every other key is
// deep-equal (compared as JSON — these are small config values such as
// resolver options, never the large element arrays).
const settingsFingerprint = (settings) => {
  const boundaryParts = [];
  const otherParts = [];
  for (const key of Object.keys(settings).sort()) {
    if (key.startsWith("boundaries/")) {
      boundaryParts.push(boundaryKeyFingerprint(key, settings[key]));
    } else {
      otherParts.push(`${key}:${JSON.stringify(settings[key])}`);
    }
  }
  return `${boundaryParts.join("|")}||${otherParts.join("|")}`;
};

const canonicalizeSettings = (settings) => {
  const cached = canonicalByRawSettings.get(settings);
  if (cached) {
    return cached;
  }
  const key = settingsFingerprint(settings);
  let canonical = canonicalByFingerprint.get(key);
  if (!canonical) {
    canonicalByFingerprint.set(key, settings);
    canonical = settings;
  }
  canonicalByRawSettings.set(settings, canonical);
  return canonical;
};

const withCanonicalSettings = (rule) => ({
  ...rule,
  create(context) {
    // Only canonicalize when boundaries settings are present; other rules'
    // contexts pass through untouched.
    if (!context.settings || !("boundaries/elements" in context.settings)) {
      return rule.create(context);
    }
    const settings = canonicalizeSettings(context.settings);
    const canonicalContext =
      settings === context.settings
        ? context
        : // A proxy keeps the full RuleContext surface (methods included)
          // while substituting only `settings`.
          new Proxy(context, {
            get(target, property) {
              return property === "settings"
                ? settings
                : Reflect.get(target, property);
            },
          });
    return rule.create(canonicalContext);
  },
});

// Returns the plugin with every rule wrapped so it sees a canonical settings
// object whenever its full settings fingerprint has been seen before.
export const canonicalizeBoundariesPlugin = (plugin) => ({
  ...plugin,
  rules: Object.fromEntries(
    Object.entries(plugin.rules).map(([name, rule]) => [
      name,
      withCanonicalSettings(rule),
    ]),
  ),
});
