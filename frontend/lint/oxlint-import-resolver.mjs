import { isBuiltin, createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const legacyNode = require("eslint-import-resolver-node");

function aliases(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const entries = Array.isArray(value) ? value : [value];
      if (entries.some((entry) => typeof entry !== "string")) {
        throw new Error(`Unsupported resolver alias: ${key}`);
      }
      return [key, entries];
    }),
  );
}

function memoize(resolve) {
  const cache = new Map();
  return (source, file) => {
    const key = `${path.dirname(file)}\0${source}`;
    if (!cache.has(key)) {
      // Bound memory for exceptionally large one-shot lint invocations.
      if (cache.size >= 50_000) {
        cache.clear();
      }
      cache.set(key, resolve(source, file));
    }
    return cache.get(key);
  };
}

/**
 * Shared resolver service for a single CLI invocation over a fixed tree.
 * Construct a fresh service after filesystem, dependency, or config changes.
 * This is not a persistent cache or an editor/watch-mode integration.
 */
export function createImportResolverService({ ResolverFactory }) {
  const settingsCache = new WeakMap();
  const resolverSettingsCache = new WeakMap();
  const webpackResolvers = new Map();
  const resolvers = new Map();
  const node = new ResolverFactory({
    extensions: [".mjs", ".cjs", ".js", ".json", ".node"],
    conditionNames: ["import", "require", "default"],
    mainFields: ["module", "main"],
    symlinks: false,
  });
  // Match the legacy resolver's package entry precedence and symlink paths.
  // Keep this separate from import-x's exports-aware first resolution attempt.
  const legacyNative = new ResolverFactory({
    extensions: [".mjs", ".js", ".json", ".node"],
    exportsFields: [],
    importsFields: [],
    mainFields: ["module", "jsnext:main", "main"],
    symlinks: false,
  });
  const resolveLegacyNode = memoize((source, file) => {
    // Oxc understands URL queries/fragments; the old node resolver treats them
    // as filename characters before webpack strips resource queries/loaders.
    if (/[?#!]/.test(source)) {
      return legacyNode.resolve(source, file);
    }
    if (isBuiltin(source)) return { found: true, path: null };
    const result = legacyNative.sync(path.dirname(file), source);
    return result.path ? { found: true, path: result.path } : { found: false };
  });

  function webpackResolver(configPath) {
    if (webpackResolvers.has(configPath)) {
      return webpackResolvers.get(configPath);
    }
    const config = require(configPath);
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("The resolver adapter needs an object Rspack config");
    }
    const supported = new Set(["extensions", "alias", "fallback"]);
    for (const key of Object.keys(config.resolve ?? {})) {
      if (!supported.has(key)) {
        throw new Error(`Unsupported Rspack resolve option: ${key}`);
      }
    }
    const externals = config.externals ?? {};
    if (
      typeof externals !== "object" ||
      Array.isArray(externals) ||
      Object.getPrototypeOf(externals) !== Object.prototype
    ) {
      throw new Error("The resolver adapter needs an object externals map");
    }
    const resolver = new ResolverFactory({
      // Match eslint-import-resolver-webpack's enhanced-resolve defaults.
      aliasFields: ["browser"],
      mainFields: ["browser", "module", "main"],
      extensions: config.resolve?.extensions ?? [".js", ".json"],
      alias: aliases(config.resolve?.alias),
      fallback: aliases(config.resolve?.fallback),
    });
    const resolve = (source, file) => {
      // The original webpack resolver strips loaders and the final query.
      source = source.slice(source.lastIndexOf("!") + 1);
      const query = source.lastIndexOf("?");
      if (query >= 0) {
        source = source.slice(0, query);
      }
      if (Object.hasOwn(externals, source)) {
        return { found: true, path: null };
      }
      const result = resolver.sync(path.dirname(file), source);
      if (result.path) {
        return { found: true, path: result.path };
      }
      if (isBuiltin(source)) {
        return { found: true, path: null };
      }
      return { found: false };
    };
    webpackResolvers.set(configPath, resolve);
    return resolve;
  }

  function forSettings(settings, mode = "import-x") {
    if (mode !== "import-x" && mode !== "import") {
      throw new Error(`Unsupported resolver mode: ${mode}`);
    }
    const cached = resolverSettingsCache.get(settings)?.get(mode);
    if (cached) {
      return cached;
    }
    for (const key of ["resolver-next", "resolver-legacy", "resolve"]) {
      if (`${mode}/${key}` in settings) {
        throw new Error(`Unsupported resolver setting: ${mode}/${key}`);
      }
    }
    const config = settings[`${mode}/resolver`];
    if (
      config !== undefined &&
      (config?.node !== true ||
        Object.keys(config)[0] !== "node" ||
        Object.keys(config).some(
          (key) => key !== "node" && key !== "webpack",
        ) ||
        (config.webpack &&
          (typeof config.webpack.config !== "string" ||
            !path.isAbsolute(config.webpack.config) ||
            Object.keys(config.webpack).some(
              (key) => key !== "config" && key !== "typescript",
            ))))
    ) {
      throw new Error("Unsupported resolver configuration in adapter");
    }
    const configPath = config?.webpack?.config;
    const key = `${mode}\0${configPath ?? ""}`;
    if (!resolvers.has(key)) {
      const webpack = configPath ? webpackResolver(configPath) : undefined;
      const resolve = memoize((source, file) => {
        // import-x uses its Rust node resolver BEFORE the legacy node fallback.
        // eslint-module-utils (boundaries/custom rules) starts at the fallback.
        if (mode === "import-x") {
          if (isBuiltin(source) || source.startsWith("data:")) {
            return { found: true, path: null };
          }
          const result = node.sync(path.dirname(file), source);
          if (result.path) {
            return { found: true, path: result.path };
          }
        }
        const result = resolveLegacyNode(source, file);
        return result.found ? result : (webpack?.(source, file) ?? result);
      });
      resolvers.set(key, {
        interfaceVersion: 3,
        name: `metabase-oxc-${mode}`,
        resolve,
      });
    }
    const resolver = resolvers.get(key);
    if (!resolverSettingsCache.has(settings)) {
      resolverSettingsCache.set(settings, new Map());
    }
    resolverSettingsCache.get(settings).set(mode, resolver);
    return resolver;
  }

  function importSettings(settings) {
    if (!settingsCache.has(settings)) {
      settingsCache.set(settings, {
        ...settings,
        "import-x/resolver-next": [forSettings(settings)],
      });
    }
    return settingsCache.get(settings);
  }

  function resolveImport(source, context) {
    if (context.settings["import/core-modules"]?.includes(source)) {
      return null;
    }
    return forSettings(context.settings, "import").resolve(
      source,
      context.physicalFilename ?? context.filename,
    ).path;
  }

  return { forSettings, importSettings, resolveImport };
}
