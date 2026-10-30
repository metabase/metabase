import { existsSync } from "node:fs";
import { isBuiltin, createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const legacyNode = require("eslint-import-resolver-node");

function aliases(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const entries = Array.isArray(value) ? value : [value];
      if (
        entries.some(
          (entry) => typeof entry !== "string" || !path.isAbsolute(entry),
        )
      ) {
        throw new Error(
          `Unsupported resolver alias: ${key} must contain absolute paths for reuse across package directories`,
        );
      }
      return [key, entries];
    }),
  );
}

const isBare = (source) => /^[\w@]/.test(source) && !/[?#!]/.test(source);

function memoize(resolve, packageRoot) {
  const cache = new Map();
  return (source, file) => {
    const directory = path.dirname(file);
    const key = `${isBare(source) ? packageRoot(directory) : directory}\0${source}`;
    if (!cache.has(key)) {
      if (cache.size >= 50_000) {
        cache.clear();
      }
      cache.set(key, resolve(source, file));
    }
    return cache.get(key);
  };
}

// Construct a fresh service after filesystem, dependency or configuration changes.
export function createImportResolverService({ ResolverFactory }) {
  const settingsCache = new WeakMap();
  const resolverSettingsCache = new WeakMap();
  const webpackResolvers = new Map();
  const resolvers = new Map();
  const packageRoots = new Map();
  // Absolute aliases and a shared node_modules ancestor make bare imports independent of subdirectory.
  function packageRoot(directory) {
    if (!packageRoots.has(directory)) {
      const parent = path.dirname(directory);
      const isRoot =
        parent === directory ||
        existsSync(path.join(directory, "package.json")) ||
        existsSync(path.join(directory, "node_modules"));
      packageRoots.set(directory, isRoot ? directory : packageRoot(parent));
    }
    return packageRoots.get(directory);
  }
  const node = new ResolverFactory({
    extensions: [".mjs", ".cjs", ".js", ".json", ".node"],
    conditionNames: ["import", "require", "default"],
    mainFields: ["module", "main"],
    symlinks: false,
  });
  // eslint-import-resolver-node ignores exports and prioritizes module, jsnext:main, then main.
  const legacyNative = new ResolverFactory({
    extensions: [".mjs", ".js", ".json", ".node"],
    exportsFields: [],
    importsFields: [],
    mainFields: ["module", "jsnext:main", "main"],
    symlinks: false,
  });
  const resolveLegacyNode = memoize((source, file) => {
    // eslint-import-resolver-node treats queries and fragments as filename characters.
    if (/[?#!]/.test(source)) {
      return legacyNode.resolve(source, file);
    }
    if (isBuiltin(source)) return { found: true, path: null };
    const result = legacyNative.sync(path.dirname(file), source);
    return result.path ? { found: true, path: result.path } : { found: false };
  }, packageRoot);

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
      const resolveFallback = (source, file) => {
        const result = resolveLegacyNode(source, file);
        return result.found ? result : (webpack?.(source, file) ?? result);
      };
      const resolveImportX = (source, file) => {
        if (isBuiltin(source) || source.startsWith("data:")) {
          return { found: true, path: null };
        }
        const result = node.sync(path.dirname(file), source);
        return result.path
          ? { found: true, path: result.path }
          : resolveFallback(source, file);
      };
      // import-x tries the exports-aware resolver before the node/webpack chain.
      const resolve = memoize(
        mode === "import-x" ? resolveImportX : resolveFallback,
        packageRoot,
      );
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
