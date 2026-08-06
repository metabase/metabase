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

// A type can have several elements (a dir pattern plus loose entry files),
// so keep them all — a last-wins map would drop the dir pattern.
const typeToElements = new Map();
for (const e of elements) {
  if (!typeToElements.has(e.type)) typeToElements.set(e.type, []);
  typeToElements.get(e.type).push(e);
}
const allTypes = [...typeToElements.keys()];

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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Path prefix covered by an element pattern: a dir with trailing slash, or an exact file path */
function patternPrefix(pattern) {
  return pattern
    .replace(/\/\*\.\*$/, "/")
    .replace(/\/\*\*$/, "/")
    .replace(/\*\//, "");
}

const analysisPrefixes = analysisTypes.flatMap((type) =>
  typeToElements.get(type).map((el) => ({
    type,
    prefix: patternPrefix(el.pattern),
  })),
);

/**
 * ^-anchored regexes for elements physically nested inside the dirs of
 * `types` without belonging to them (e.g. app/embedding-iframe-sdk inside
 * shared/embedding's dir, basic/mlv1 inside lib/mlv2's dir). Used as pathNot
 * so a broad dir regex doesn't swallow the nested module's files — the
 * eslint-boundaries plugin resolves this with first-match-wins precedence,
 * which plain regexes can't express.
 */
function nestedForeignPaths(types) {
  const typeSet = new Set(types);
  const dirs = analysisPrefixes
    .filter((p) => typeSet.has(p.type) && p.prefix.endsWith("/"))
    .map((p) => p.prefix);
  // app/misc claims loose files inside otherwise-claimed dirs (e.g.
  // new/components/NewModals) — always foreign here since app/misc is
  // never part of a rule's type set.
  const pool = [
    ...analysisPrefixes,
    ...(typeToElements.get("app/misc") ?? [])
      .filter((el) => !el.pattern.includes("*"))
      .map((el) => ({ type: "app/misc", prefix: el.pattern })),
  ];
  const out = [];
  for (const { type, prefix } of pool) {
    if (typeSet.has(type)) continue;
    if (dirs.some((d) => prefix !== d && prefix.startsWith(d))) {
      out.push(`^${escapeRegex(prefix)}`);
    }
  }
  return out;
}

/** dep-cruiser from/to matcher ({ path, pathNot? }) for a set of element types */
function typesToMatcher(types) {
  const path = typesToRegex(types);
  if (!path) return null;
  const pathNot = nestedForeignPaths(types);
  return pathNot.length > 0 ? { path, pathNot } : { path };
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
    // importKind: "type" allows are treated as full allows — this version of
    // dep-cruiser doesn't reliably tag type-only imports, so we can't scope
    // the exemption. The dependencyTypesNot below is a no-op today but will
    // narrow these correctly if tagging starts working.
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
  const rawPatterns = [];
  const filePatterns = [];

  for (const type of types) {
    for (const el of typeToElements.get(type) ?? []) {
      const subMatch = el.pattern.match(
        /^frontend\/src\/metabase\/([\w-]+)\/\*\*$/,
      );
      if (subMatch) {
        metabaseSubdirs.push(subMatch[1]);
        continue;
      }

      const topMatch = el.pattern.match(
        /^frontend\/src\/([\w-]+)\/(?:\*\/)?\*\*$/,
      );
      if (topMatch) {
        topLevelDirs.push(topMatch[1]);
        continue;
      }

      // Single-file elements (mode: "full") match by exact path
      if (!el.pattern.includes("*")) {
        filePatterns.push(escapeRegex(el.pattern));
        continue;
      }

      // Handle patterns outside frontend/src/metabase/ (e.g. enterprise/frontend/src/metabase-enterprise/**)
      // Skip patterns with globs in the directory path (like frontend/src/*/**)
      const rawMatch = el.pattern.match(/^([^*]+)\/\*\*$/);
      if (rawMatch) {
        rawPatterns.push(rawMatch[1]);
      }
    }
  }

  const parts = [...topLevelDirs];
  if (metabaseSubdirs.length === 1) {
    parts.push(`metabase/${metabaseSubdirs[0]}`);
  } else if (metabaseSubdirs.length > 1) {
    parts.push(`metabase/(${metabaseSubdirs.join("|")})`);
  }

  // Build frontend/src/ regex
  const frontendRegex =
    parts.length === 0
      ? null
      : parts.length === 1
        ? `^frontend/src/${parts[0]}/`
        : `^frontend/src/(${parts.join("|")})/`;

  // Build raw patterns regex (for paths outside frontend/src/metabase/)
  const rawRegex =
    rawPatterns.length === 0
      ? null
      : rawPatterns.length === 1
        ? `^${rawPatterns[0]}/`
        : `^(${rawPatterns.join("|")})/`;

  const fileRegex =
    filePatterns.length === 0 ? null : `^(${filePatterns.join("|")})$`;

  const pieces = [frontendRegex, rawRegex, fileRegex].filter(Boolean);
  if (pieces.length === 0) return null;
  return pieces.length === 1 ? pieces[0] : `(${pieces.join("|")})`;
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

    // Group tier members by identical cross-tier forbidden sets — per-element
    // exceptions (whitelisted edges like admin-theme-preview → iframe-sdk)
    // mean a tier is not always homogeneous, and a tier-wide union would
    // flag the excepted element's allowed imports.
    const crossGroups = new Map();
    for (const [type, forbidden] of typeMap) {
      const cross = forbidden.filter((f) => getTier(f) !== tier).sort();
      if (cross.length === 0) continue;
      const key = cross.join("|");
      if (!crossGroups.has(key)) crossGroups.set(key, { types: [], cross });
      crossGroups.get(key).types.push(type);
    }

    for (const { types: groupTypes, cross } of crossGroups.values()) {
      const fromMatcher = typesToMatcher(groupTypes);
      const toMatcher = typesToMatcher(cross);

      if (fromMatcher && toMatcher) {
        const targetTiers = [...new Set(cross.map(getTier))].sort();

        result.push({
          name: `no-${tier}-to-${targetTiers.join("-")}`,
          comment: `${tier} modules should not import from ${targetTiers.join("/")} modules`,
          severity: "error",
          from: fromMatcher,
          to: toMatcher,
        });
      }
    }

    // --- Same-tier cross-import rules ---
    // Check if any element in this tier is forbidden from importing other
    // same-tier elements (e.g. feature→feature, basic→basic)
    const hasCrossImportRestriction = [...typeMap.values()].some((forbidden) =>
      forbidden.some((f) => getTier(f) === tier),
    );

    if (hasCrossImportRestriction && tierTypes.length >= 2) {
      // For each pair of types in this tier, check whether cross-imports
      // are actually forbidden (respecting per-element exceptions like
      // enterprise being allowed to import other features).

      // Split into "simple" types (a single metabase/<name>/ dir whose name
      // matches the type name, so the $1-backreference trick works) and
      // "special" types (everything else: multi-pattern, hyphen-mismatched,
      // file-based, or outside frontend/src/metabase/).
      const isSimple = (t) => {
        const els = typeToElements.get(t);
        if (els.length !== 1) return false;
        const m = els[0].pattern.match(/^frontend\/src\/metabase\/([\w-]+)\/\*\*$/);
        return m !== null && m[1] === getName(t);
      };
      const simpleTypes = tierTypes.filter(isSimple);
      const specialTypes = tierTypes.filter((t) => !isSimple(t));

      // Simple types all have identical cross-import restrictions,
      // so use pathNot backreference for efficiency
      const restrictedSimple = simpleTypes.filter((t) =>
        typeMap.get(t)?.some((f) => getTier(f) === tier),
      );
      if (restrictedSimple.length >= 2) {
        const names = restrictedSimple.map(getName);
        const regex = `^frontend/src/metabase/(${names.join("|")})/`;
        const nested = nestedForeignPaths(restrictedSimple);
        result.push({
          name: `no-${tier}-cross-import`,
          comment: `${tier} modules should not import from other ${tier} modules`,
          severity: "error",
          from: nested.length > 0 ? { path: regex, pathNot: nested } : { path: regex },
          to: { path: regex, pathNot: [`^frontend/src/metabase/$1/`, ...nested] },
        });
      }

      // Cross-rules between simple and special types — only add
      // a rule if that specific direction is actually forbidden
      for (const special of specialTypes) {
        const specialForbidden = typeMap.get(special) ?? [];
        const simpleForbidden = simpleTypes.filter((s) =>
          (typeMap.get(s) ?? []).includes(special),
        );

        // special → simple (only if special is forbidden from importing simple)
        const forbiddenSimpleTargets = simpleTypes.filter((s) =>
          specialForbidden.includes(s),
        );
        if (forbiddenSimpleTargets.length > 0) {
          const toMatcher = typesToMatcher(forbiddenSimpleTargets);
          const fromMatcher = typesToMatcher([special]);
          if (fromMatcher && toMatcher) {
            result.push({
              name: `no-${tier}-cross-import`,
              comment: `${tier} modules should not import from other ${tier} modules`,
              severity: "error",
              from: fromMatcher,
              to: toMatcher,
            });
          }
        }

        // simple → special (only if simple types are forbidden from importing special)
        if (simpleForbidden.length > 0) {
          const fromMatcher = typesToMatcher(simpleForbidden);
          const toMatcher = typesToMatcher([special]);
          if (fromMatcher && toMatcher) {
            result.push({
              name: `no-${tier}-cross-import`,
              comment: `${tier} modules should not import from other ${tier} modules`,
              severity: "error",
              from: fromMatcher,
              to: toMatcher,
            });
          }
        }
      }

      // Cross-rules among special types
      for (let i = 0; i < specialTypes.length; i++) {
        for (let j = i + 1; j < specialTypes.length; j++) {
          const iForbidden = typeMap.get(specialTypes[i]) ?? [];
          const jForbidden = typeMap.get(specialTypes[j]) ?? [];
          const matcherI = typesToMatcher([specialTypes[i]]);
          const matcherJ = typesToMatcher([specialTypes[j]]);
          if (iForbidden.includes(specialTypes[j]) && matcherI && matcherJ) {
            result.push({
              name: `no-${tier}-cross-import`,
              severity: "error",
              from: matcherI,
              to: matcherJ,
            });
          }
          if (jForbidden.includes(specialTypes[i]) && matcherI && matcherJ) {
            result.push({
              name: `no-${tier}-cross-import`,
              severity: "error",
              from: matcherJ,
              to: matcherI,
            });
          }
        }
      }
    }
  }

  // --- shared/other rules ---
  // shared/other is a catch-all for unnamed frontend/src/ dirs.
  // It follows shared-tier rules: can import lib/basic/shared, cannot import feature/app.
  const otherEl = elements.find((e) => e.type === "shared/other");
  if (otherEl) {
    const otherAllowed = computeAllowed("shared/other");
    const otherForbidden = analysisTypes.filter(
      (t) => !otherAllowed.has(t) && t !== "shared/other",
    );
    if (otherForbidden.length > 0) {
      const toMatcher = typesToMatcher(otherForbidden);
      // Exclude every named element (dir prefix or exact file), plus app/misc
      // files directly under frontend/src/metabase/ (they follow app/* rules
      // which allow everything).
      const namedPath = [
        ...analysisPrefixes.map(({ prefix }) =>
          prefix.endsWith("/")
            ? `^${escapeRegex(prefix)}`
            : `^${escapeRegex(prefix)}$`,
        ),
        "^frontend/src/metabase/[^/]+$",
      ];

      if (toMatcher) {
        result.push({
          name: "no-other-to-feature",
          comment: "Unnamed shared modules should not import from feature/app modules",
          severity: "error",
          from: {
            path: "^frontend/src/",
            pathNot: namedPath,
          },
          to: toMatcher,
        });
      }
    }
  }

  // eslint-boundaries ignores type-only imports (they're erased at compile
  // time), so exempt them from every boundary rule to match.
  return result.map((rule) => ({
    ...rule,
    to: { ...rule.to, dependencyTypesNot: ["type-only"] },
  }));
}

// ---------------------------------------------------------------------------
// Generate includeOnly regex from elements
// ---------------------------------------------------------------------------

function generateIncludeOnly() {
  // One ^-anchored prefix per element (dir or exact file). frontend/src/metabase/
  // is included wholesale so not-yet-assigned dirs still show up (they render
  // as "other" and are checked by the no-other-to-feature rule).
  const prefixes = new Set(["^frontend/src/metabase/"]);
  for (const { prefix } of analysisPrefixes) {
    prefixes.add(
      prefix.endsWith("/") ? `^${escapeRegex(prefix)}` : `^${escapeRegex(prefix)}$`,
    );
  }
  return [...prefixes].join("|");
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
        /^frontend\/src\/([\w-]+)\/(?:\*\/)?\*\*$/,
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
    for (const el of typeToElements.get(type) ?? []) {
      const topMatch = el.pattern.match(
        /^frontend\/src\/([\w-]+)\/(?:\*\/)?\*\*$/,
      );
      if (topMatch) {
        topLevel.push(topMatch[1]);
      }
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
