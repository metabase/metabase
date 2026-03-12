import { elements, rules } from "./frontend/lint/module-boundaries.mjs";

const tierColors = {
  lib: "#e8f5e9",
  basic: "#e3f2fd",
  shared: "#fff3e0",
  feature: "#fce4ec",
  app: "#f3e5f5",
};

// ---------------------------------------------------------------------------
// Helpers: derive dep-cruiser config from boundaries
// ---------------------------------------------------------------------------

const typeToElement = new Map(elements.map((e) => [e.type, e]));
const allTypes = elements.map((e) => e.type);

/** Types eligible for forbidden-rule analysis (excludes catch-alls) */
const analysisTypes = allTypes.filter((t) => t !== "other" && t !== "app/misc");

function getTier(type) {
  const idx = type.indexOf("/");
  return idx >= 0 ? type.slice(0, idx) : type;
}

function getName(type) {
  const idx = type.indexOf("/");
  return idx >= 0 ? type.slice(idx + 1) : type;
}

/** Expand a boundaries wildcard pattern to matching element types */
function expandWildcard(pattern) {
  if (pattern === "*") return [...allTypes];
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // "lib/" from "lib/*"
    return allTypes.filter((t) => t.startsWith(prefix));
  }
  return allTypes.includes(pattern) ? [pattern] : [];
}

/** Compute the full set of types an element is allowed to import */
function computeAllowed(elementType) {
  const allowed = new Set();
  for (const rule of rules) {
    const froms = rule.from.flatMap(expandWildcard);
    if (froms.includes(elementType)) {
      rule.allow.flatMap(expandWildcard).forEach((t) => allowed.add(t));
    }
  }
  return allowed;
}

/**
 * Convert a list of element types to a combined dep-cruiser path regex.
 *
 * Groups metabase/<name>/ paths together and keeps top-level dirs
 * (metabase-types, metabase-lib) separate, producing readable patterns like:
 *   ^frontend/src/(metabase-lib|metabase/(ui|api))/
 */
function typesToRegex(types) {
  const metabaseSubdirs = [];
  const topLevelDirs = [];

  for (const type of types) {
    const el = typeToElement.get(type);
    if (!el) continue;

    const subMatch = el.pattern.match(/^frontend\/src\/metabase\/(\w+)\/\*\*$/);
    if (subMatch) {
      metabaseSubdirs.push(subMatch[1]);
      continue;
    }

    const topMatch = el.pattern.match(/^frontend\/src\/([\w-]+)\/?\*\/?\*\*$/);
    if (topMatch) {
      topLevelDirs.push(topMatch[1]);
    }
  }

  const parts = [...topLevelDirs];
  if (metabaseSubdirs.length === 1) {
    parts.push(`metabase/${metabaseSubdirs[0]}`);
  } else if (metabaseSubdirs.length > 1) {
    parts.push(`metabase/(${metabaseSubdirs.join("|")})`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return `^frontend/src/${parts[0]}/`;
  return `^frontend/src/(${parts.join("|")})/`;
}

// ---------------------------------------------------------------------------
// Generate forbidden rules by inverting the boundaries allowlist
// ---------------------------------------------------------------------------

function generateForbiddenRules() {
  // For each analysis type, compute its cross-tier forbidden targets
  const tierForbiddenMap = new Map(); // tier → Set<forbidden analysis types>

  for (const type of analysisTypes) {
    const tier = getTier(type);
    const allowed = computeAllowed(type);
    const forbidden = analysisTypes.filter(
      (t) => t !== type && !allowed.has(t),
    );

    if (!tierForbiddenMap.has(tier)) tierForbiddenMap.set(tier, new Map());
    tierForbiddenMap.get(tier).set(type, forbidden);
  }

  const result = [];

  // --- Cross-tier rules ---
  // Elements in the same tier share the same cross-tier forbidden targets,
  // so group them into one rule per source tier.
  for (const [tier, typeMap] of tierForbiddenMap) {
    const tierTypes = [...typeMap.keys()];

    // Collect all cross-tier forbidden targets for this tier
    const crossTierForbidden = new Set();
    for (const [type, forbidden] of typeMap) {
      for (const f of forbidden) {
        if (getTier(f) !== tier) crossTierForbidden.add(f);
      }
    }

    if (crossTierForbidden.size > 0) {
      const targetTiers = [
        ...new Set([...crossTierForbidden].map(getTier)),
      ].sort();

      result.push({
        name: `no-${tier}-to-${targetTiers.join("-")}`,
        comment: `${tier} modules should not import from ${targetTiers.join("/")} modules`,
        severity: "error",
        from: { path: typesToRegex(tierTypes) },
        to: { path: typesToRegex([...crossTierForbidden]) },
      });
    }

    // --- Same-tier cross-import rules ---
    // Check if any element in this tier is forbidden from importing other
    // same-tier elements (e.g. feature→feature, basic→basic)
    const hasCrossImportRestriction = [...typeMap.values()].some((forbidden) =>
      forbidden.some((f) => getTier(f) === tier),
    );

    if (hasCrossImportRestriction && tierTypes.length >= 2) {
      // Split into "simple" types (metabase/<name>/) and "special" types
      const simpleTypes = tierTypes.filter((t) => {
        const el = typeToElement.get(t);
        return /^frontend\/src\/metabase\/\w+\/\*\*$/.test(el.pattern);
      });
      const specialTypes = tierTypes.filter((t) => {
        const el = typeToElement.get(t);
        return !/^frontend\/src\/metabase\/\w+\/\*\*$/.test(el.pattern);
      });

      // Simple types: use pathNot backreference
      if (simpleTypes.length >= 2) {
        const names = simpleTypes.map(getName);
        const regex = `^frontend/src/metabase/(${names.join("|")})/`;
        result.push({
          name: `no-${tier}-cross-import`,
          comment: `${tier} modules should not import from other ${tier} modules`,
          severity: "error",
          from: { path: regex },
          to: { path: regex, pathNot: `^frontend/src/metabase/$1/` },
        });
      }

      // Cross-rules between simple and special types (bidirectional)
      if (simpleTypes.length > 0 && specialTypes.length > 0) {
        result.push({
          name: `no-${tier}-cross-import`,
          comment: `${tier} modules should not import from other ${tier} modules`,
          severity: "error",
          from: { path: typesToRegex(specialTypes) },
          to: { path: typesToRegex(simpleTypes) },
        });
        result.push({
          name: `no-${tier}-cross-import`,
          comment: `${tier} modules should not import from other ${tier} modules`,
          severity: "error",
          from: { path: typesToRegex(simpleTypes) },
          to: { path: typesToRegex(specialTypes) },
        });
      }

      // Cross-rules among special types
      for (let i = 0; i < specialTypes.length; i++) {
        for (let j = i + 1; j < specialTypes.length; j++) {
          const regexI = typesToRegex([specialTypes[i]]);
          const regexJ = typesToRegex([specialTypes[j]]);
          result.push({
            name: `no-${tier}-cross-import`,
            severity: "error",
            from: { path: regexI },
            to: { path: regexJ },
          });
          result.push({
            name: `no-${tier}-cross-import`,
            severity: "error",
            from: { path: regexJ },
            to: { path: regexI },
          });
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Generate includeOnly regex from elements
// ---------------------------------------------------------------------------

function generateIncludeOnly() {
  const topLevelDirs = [];
  let hasOtherCatchAll = false;

  for (const type of analysisTypes) {
    const el = typeToElement.get(type);
    // Broad catch-all pattern like frontend/src/*/** means include all metabase/
    if (el.pattern === "frontend/src/*/**") {
      hasOtherCatchAll = true;
      continue;
    }
    const topMatch = el.pattern.match(/^frontend\/src\/([\w-]+)\/?\*\/?\*\*$/);
    if (topMatch) {
      topLevelDirs.push(topMatch[1]);
    }
    // metabase subdirs are covered by the catch-all or by "metabase/" below
  }

  if (hasOtherCatchAll) {
    // shared/other catches everything under metabase/, so include all of it
    const inner = [...topLevelDirs, "metabase"].join("|");
    return `^frontend/src/(${inner})/`;
  }

  // No catch-all: enumerate specific metabase subdirs
  const metabaseSubdirs = [];
  for (const type of analysisTypes) {
    const el = typeToElement.get(type);
    const subMatch = el.pattern.match(/^frontend\/src\/metabase\/(\w+)\/\*\*$/);
    if (subMatch) metabaseSubdirs.push(subMatch[1]);
  }

  const inner = [
    ...topLevelDirs,
    `metabase/(${metabaseSubdirs.join("|")})`,
  ].join("|");

  return `^frontend/src/(${inner})/`;
}

// ---------------------------------------------------------------------------
// Generate reporter module themes from elements + tierColors
// ---------------------------------------------------------------------------

function generateModuleThemes() {
  const themes = [];

  for (const el of elements) {
    if (el.type === "other" || el.type === "app/misc") continue;

    const tier = getTier(el.type);
    const color = tierColors[tier];
    if (!color) continue;

    let sourceRegex;
    let isTopLevel = false;

    const subMatch = el.pattern.match(/^frontend\/src\/metabase\/(\w+)\/\*\*$/);
    if (subMatch) {
      sourceRegex = `^frontend/src/metabase/${subMatch[1]}/`;
    } else {
      const topMatch = el.pattern.match(
        /^frontend\/src\/([\w-]+)\/?\*\/?\*\*$/,
      );
      if (topMatch) {
        sourceRegex = `^frontend/src/${topMatch[1]}/`;
        isTopLevel = true;
      } else {
        continue;
      }
    }

    const attrs = { fillcolor: color };
    // Top-level dirs (metabase-types, metabase-lib) need a label override
    // since the collapsed path shows the full directory name
    if (isTopLevel) {
      attrs.label = getName(el.type);
    }

    themes.push({
      criteria: { source: sourceRegex },
      attributes: attrs,
    });
  }

  return themes;
}

// ---------------------------------------------------------------------------
// Generate collapse pattern from elements
// ---------------------------------------------------------------------------

function generateCollapsePattern() {
  // Top-level dirs need an extra segment collapsed (e.g. metabase-types/api/*)
  const topLevel = [];
  const metabaseDirs = [];

  for (const type of analysisTypes) {
    const el = typeToElement.get(type);
    const topMatch = el.pattern.match(/^frontend\/src\/([\w-]+)\/?\*\/?\*\*$/);
    if (topMatch) {
      topLevel.push(topMatch[1]);
    }
  }

  if (topLevel.length > 0) {
    return `^frontend/src/(${topLevel.join("|")})/[^/]+/|^frontend/src/metabase/([^/]+)/`;
  }
  return `^frontend/src/metabase/([^/]+)/`;
}

// ---------------------------------------------------------------------------
// Exported configuration
// ---------------------------------------------------------------------------

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      comment: "No circular dependencies allowed between modules",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    ...generateForbiddenRules(),
  ],

  options: {
    cache: {
      folder: "node_modules/.cache/dependency-cruiser",
      strategy: "content",
    },
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: {
      path: generateIncludeOnly(),
    },
    exclude: {
      path: ["\\.(unit\\.spec|stories)\\.", "(^|/)e2e/", "(^|/)test/"],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: generateCollapsePattern(),
        theme: {
          graph: {
            rankdir: "TB",
            splines: "ortho",
          },
          modules: generateModuleThemes(),
          dependencies: [
            {
              criteria: { "rules[0].severity": "error" },
              attributes: { color: "red", fontcolor: "red" },
            },
          ],
        },
      },
    },
  },
};
