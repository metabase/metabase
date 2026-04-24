#!/usr/bin/env node

/**
 * Generates a module boundary dependency graph as SVG.
 *
 * Runs dependency-cruiser, renders the graph with Graphviz, and injects an
 * "Other modules" sidebar listing directories not yet assigned to a tier.
 *
 * Usage:
 *   node scripts/module-graph.mjs > module-boundaries.svg
 */

import { readdirSync, existsSync, readFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { elements } from "../frontend/lint/module-boundaries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const tierColors = {
  lib: "#e8f5e9",
  basic: "#e3f2fd",
  shared: "#fff3e0",
  feature: "#fce4ec",
  app: "#f3e5f5",
};

// ---------------------------------------------------------------------------
// Derive configuration from boundaries
// ---------------------------------------------------------------------------

function getTier(type) {
  const idx = type.indexOf("/");
  return idx >= 0 ? type.slice(0, idx) : type;
}

function getName(type) {
  const idx = type.indexOf("/");
  return idx >= 0 ? type.slice(idx + 1) : type;
}

/** Extract the collapsed directory path from an element pattern. */
function patternToDir(pattern) {
  return pattern
    .replace(/\/\*\.\*$/, "/")
    .replace(/\/\*\*$/, "/")
    .replace(/\*\//, "");
}

/** Elements eligible for graph display (exclude catch-alls, deduplicate types) */
const seenTypes = new Set();
const graphElements = elements.filter((e) => {
  if (e.type === "other") return false;
  if (seenTypes.has(e.type)) return false;
  seenTypes.add(e.type);
  return true;
});

/** Last directory segment from a pattern, used to disambiguate short-name collisions. */
function patternToDirName(pattern) {
  const dir = patternToDir(pattern).replace(/\/$/, "");
  const parts = dir.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

// Detect short-name collisions across tiers (e.g. lib/types vs shared/types).
// Without disambiguation, a colliding node appears in multiple rank=same subgraphs,
// which merges those tiers' ranks in Graphviz.
const shortNameCounts = {};
for (const el of graphElements) {
  if (el.type === "app/misc") continue;
  const n = getName(el.type);
  shortNameCounts[n] = (shortNameCounts[n] || 0) + 1;
}

function moduleNameForElement(el) {
  const baseName = getName(el.type);
  return shortNameCounts[baseName] > 1 ? patternToDirName(el.pattern) : baseName;
}

/** Map collapsed directory paths → short module names, sorted longest-first for prefix matching */
const moduleNamesUnsorted = {};
for (const el of graphElements) {
  if (el.type === "app/misc") continue;
  moduleNamesUnsorted[patternToDir(el.pattern)] = moduleNameForElement(el);
}
// Map individual app/misc file paths to "misc"
for (const el of elements) {
  if (el.type === "app/misc" && el.mode === "full") {
    moduleNamesUnsorted[el.pattern] = "misc";
  }
}
const moduleNames = {};
for (const key of Object.keys(moduleNamesUnsorted).sort((a, b) => b.length - a.length)) {
  moduleNames[key] = moduleNamesUnsorted[key];
}

/**
 * Manual layout for the shared tier. Shared has too many modules to fit one
 * row, so we split it into named sub-tiers (each rendered as its own row, same
 * way `meta_feature` was extracted from `feature` for `enterprise`). All
 * sub-tiers share the "shared" color and legend entry.
 *
 * Any shared module not listed here falls into the last sub-tier.
 */
const sharedSubtiers = [
  {
    id: "shared_core",
    modules: ["common", "querying", "api", "visualizations", "embedding", "palette", "metadata"],
  },
  {
    id: "shared_data",
    modules: [
      "data-grid", "data-studio", "databases", "detail-view", "documents",
      "metrics", "metrics-viewer",
    ],
  },
  {
    id: "shared_browse",
    modules: [
      "account", "archive", "auth", "browse", "collections", "comments",
      "history", "home",
    ],
  },
  {
    id: "shared_actions",
    modules: [
      "new", "pulse", "questions", "search", "setup", "status", "timelines",
      "transforms",
    ],
  },
  {
    id: "shared_infra",
    modules: ["forms", "hoc", "hooks", "i18n", "router", "styled-components", "types", "urls"],
  },
  {
    id: "shared_embedding",
    modules: ["custom-viz", "embedding-ee", "embedding-sdk-package", "embedding-sdk-shared", "metabase-shared"],
  },
];
const SHARED_FALLBACK_SUBTIER = sharedSubtiers[sharedSubtiers.length - 1].id;

const moduleToSubtier = {};
for (const st of sharedSubtiers) {
  for (const m of st.modules) {
    moduleToSubtier[m] = st.id;
  }
}

function tierForElement(el) {
  if (el.type === "feature/enterprise") return "meta_feature";
  const baseTier = getTier(el.type);
  if (baseTier !== "shared") return baseTier;
  return moduleToSubtier[moduleNameForElement(el)] ?? SHARED_FALLBACK_SUBTIER;
}

/** Tier ordering for the graph layout (feature at top, lib at bottom) */
const tierOrder = [...new Set(graphElements.map((e) => getTier(e.type)))].reverse();

// Insert a synthetic "meta_feature" tier for enterprise, above "feature"
const featureIdx = tierOrder.indexOf("feature");
if (featureIdx >= 0) {
  tierOrder.splice(featureIdx, 0, "meta_feature");
}

// Expand "shared" into its sub-tiers
const sharedIdx = tierOrder.indexOf("shared");
if (sharedIdx >= 0) {
  tierOrder.splice(sharedIdx, 1, ...sharedSubtiers.map((s) => s.id));
}

/** Tier definitions: label, color, and module names */
const tiers = {};
for (const el of graphElements) {
  const tier = tierForElement(el);
  if (!tiers[tier]) {
    tiers[tier] = {
      label: tier === "meta_feature" ? "feature" : tier.startsWith("shared") ? "shared" : tier,
      color: tierColors[getTier(el.type)] || "#ffffff",
      modules: [],
    };
  }
  tiers[tier].modules.push(moduleNameForElement(el));
}

/** Directories already assigned to a tier */
const namedDirs = new Set();
for (const el of elements) {
  if (el.type === "other" || el.type === "app/misc") continue;
  const match = el.pattern.match(/^frontend\/src\/metabase\/(\w+)\//);
  if (match) namedDirs.add(match[1]);
}

/**
 * Invisible vertical spines that anchor the horizontal column layout. Each
 * spine puts its modules in the same x-column. Avoid putting two modules from
 * the same tier in one spine — Graphviz's chain semantics would force them
 * onto different ranks, breaking the tier's rank=same row.
 */
// Spines act as invisible vertical column anchors. The first spine is the
// leftmost column — it must include the top-tier nodes (misc, enterprise),
// otherwise those nodes float left of the column and drag whatever spine
// they're in along with them, flipping the column order.
const spines = [
  ["misc", "enterprise", "dashboard", "common", "metabase-types"],
  ["querying", "ui", "utils"],
  ["admin", "visualizations"],
  ["reference"],
];

// ---------------------------------------------------------------------------
// Run depcruise & parse JSON
// ---------------------------------------------------------------------------

const moduleDirs = [
  ...new Set(
    graphElements
      .filter((el) => el.type !== "app/misc")
      .map((el) => patternToDir(el.pattern).replace(/\/$/, ""))
      .filter((dir) => existsSync(dir)),
  ),
];

/** Build collapse pattern from elements */
function buildCollapsePattern() {
  const topLevel = [];
  const extraPrefixes = [];
  for (const el of graphElements) {
    const m = el.pattern.match(/^frontend\/src\/([\w-]+)\/?\*\/?\*\*$/);
    if (m) {
      topLevel.push(m[1]);
      continue;
    }
    // Handle paths outside frontend/src/ (e.g. enterprise/frontend/src/metabase-enterprise/**)
    const rawMatch = el.pattern.match(/^([^*]+)\/\*\*$/);
    if (rawMatch && !rawMatch[1].startsWith("frontend/src/")) {
      extraPrefixes.push(`^${rawMatch[1]}/`);
    }
  }
  let pattern = topLevel.length > 0
    ? `^frontend/src/(${topLevel.join("|")})/|^frontend/src/metabase/([^/]+)/`
    : `^frontend/src/metabase/([^/]+)/`;
  if (extraPrefixes.length > 0) {
    pattern += "|" + extraPrefixes.join("|");
  }
  return pattern;
}

const collapsePattern = buildCollapsePattern();

const depcruiseCmd = [
  "bunx depcruise",
  ...moduleDirs,
  "--config .dependency-cruiser.mjs",
  "--output-type json",
].join(" ");

// Helper: run depcruise via temp file to avoid ENOBUFS with large output
function depcruiseJSON(extraArgs = "") {
  const tmp = join(tmpdir(), `depcruise-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    execSync(`${depcruiseCmd} ${extraArgs} > "${tmp}"`, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(readFileSync(tmp, "utf8"));
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// Collapsed run for edges and violation detection
const collapsed = depcruiseJSON(`--collapse '${collapsePattern}'`);

const moduleToTier = {};
for (const [tier, { modules }] of Object.entries(tiers)) {
  for (const mod of modules) {
    moduleToTier[mod] = tier;
  }
}

const tierIndex = {};
tierOrder.forEach((t, i) => {
  tierIndex[t] = i;
});

// ---------------------------------------------------------------------------
// Collect edges and violations from collapsed output
// ---------------------------------------------------------------------------

const edges = new Map();

for (const mod of collapsed.modules) {
  const fromName = moduleNames[mod.source] ?? (mod.source.startsWith("frontend/src/") ? "other" : null);
  if (!fromName) continue;

  for (const dep of mod.dependencies) {
    const toName = moduleNames[dep.resolved] ?? (dep.resolved.startsWith("frontend/src/") ? "other" : null);
    if (!toName || toName === fromName) continue;

    const key = `${fromName}->${toName}`;
    if (!edges.has(key)) {
      edges.set(key, {
        from: fromName,
        to: toName,
        violations: [],
        violationCount: 0,
      });
    }

    const boundaryRules = (dep.rules ?? []).filter(
      (r) => r.name !== "no-circular",
    );
    if (boundaryRules.length > 0) {
      const edge = edges.get(key);
      edge.violationCount += 1;
      for (const rule of boundaryRules) {
        if (!edge.violations.includes(rule.name)) {
          edge.violations.push(rule.name);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Build Graphviz dot source
// ---------------------------------------------------------------------------

function buildDot() {
  const out = [];
  const emit = (line) => out.push(line);

  // spineColumn = which spine the module belongs to (anchors its x position).
  // spinePosition = index within that spine; tie-breaker so the in-row chain
  // runs in the same direction as the spine chain (otherwise we get invisible
  // cycles that blow up the x-layout).
  const spineColumn = {};
  const spinePosition = {};
  for (let i = 0; i < spines.length; i++) {
    for (let j = 0; j < spines[i].length; j++) {
      spineColumn[spines[i][j]] = i;
      spinePosition[spines[i][j]] = j;
    }
  }
  function spineSort(a, b) {
    const ca = spineColumn[a] ?? 999;
    const cb = spineColumn[b] ?? 999;
    if (ca !== cb) return ca - cb;
    return (spinePosition[a] ?? 999) - (spinePosition[b] ?? 999);
  }

  // Graph attributes
  emit("digraph modules {");
  emit('  rankdir="TB"');
  emit('  newrank="true"');
  emit('  splines="line"');
  emit('  outputorder="edgesfirst"');
  emit('  nodesep="0.8"');
  emit('  ranksep="0.7"');
  emit('  pad="0.3"');
  emit('  fontname="Helvetica"');
  emit(
    '  node [shape="box" style="rounded,filled" fontname="Helvetica" fontsize="12" height="0.4"]',
  );
  emit('  edge [fontname="Helvetica" fontsize="9" arrowsize="0.7"]');
  emit("");

  // Legend
  emit("  subgraph cluster_legend {");
  emit('    label="Legend"');
  emit('    fontsize="12"');
  emit('    fontcolor="#666666"');
  emit('    style="rounded"');
  emit('    color="#cccccc"');
  emit("    subgraph cluster_legend_tiers {");
  emit('      label="Tiers"');
  emit('      fontsize="10"');
  emit('      fontcolor="#999999"');
  emit('      style="rounded"');
  emit('      color="#dddddd"');
  // Collapse adjacent tiers with the same legend label (e.g. shared sub-tiers)
  const legendTiers = [];
  for (const tierId of tierOrder) {
    const { label, color } = tiers[tierId];
    const prev = legendTiers[legendTiers.length - 1];
    if (prev && prev.label === label) continue;
    legendTiers.push({ tierId, label, color });
  }
  for (const { tierId, label, color } of legendTiers) {
    emit(
      `  "legend_${tierId}" [label="${label}" fillcolor="${color}" width="1.0"]`,
    );
  }
  const legendChain = legendTiers.map((t) => `"legend_${t.tierId}"`).join(" -> ");
  emit(`      ${legendChain} [style="invis"]`);
  emit("    }");
  emit("  }");
  // Anchor the legend column horizontally next to the main graph — without
  // this anchor Graphviz leaves a huge gap between them.
  emit(`  "legend_${legendTiers[0].tierId}" -> "misc" [style="invis" weight="1000"]`);
  emit("");

  // Module nodes
  for (const tierId of tierOrder) {
    const { color, modules } = tiers[tierId];
    for (const mod of modules) {
      emit(
        `  "${mod}" [label="${mod}" fillcolor="${color}" group="${tierId}"]`,
      );
    }
  }
  emit("");

  // rank=same subgraphs — one row per tier. Each shared sub-tier is its own
  // tier, the same way meta_feature is.
  function emitTierSubgraph(tierId, indent) {
    const { modules } = tiers[tierId];
    const ordered = [...modules].sort(spineSort);
    emit(`${indent}subgraph cluster_tier_${tierId} {`);
    emit(`${indent}  style="invis"`);
    emit(`${indent}  rank="same"`);
    for (const mod of ordered) {
      emit(`${indent}  "${mod}"`);
    }
    if (ordered.length >= 2) {
      const chain = ordered.map((m) => `"${m}"`).join(" -> ");
      emit(`${indent}  ${chain} [style="invis" weight="1"]`);
    }
    emit(`${indent}}`);
  }

  for (const tierId of tierOrder) {
    emitTierSubgraph(tierId, "  ");
    emit("");
  }

  // Invisible spines for horizontal column anchoring
  for (const spine of spines) {
    for (let i = 0; i < spine.length - 1; i++) {
      emit(`  "${spine[i]}" -> "${spine[i + 1]}" [style="invis" weight="100"]`);
    }
  }

  // Between-tier stacking: spines only traverse tiers that contain a spine
  // module, so tiers like the shared sub-tiers (which often have no spine
  // module) need an explicit chain to sit between their neighbours.
  for (let t = 0; t < tierOrder.length - 1; t++) {
    const upperModules = tiers[tierOrder[t]].modules;
    const lowerModules = tiers[tierOrder[t + 1]].modules;
    if (!upperModules.length || !lowerModules.length) continue;
    const upper = [...upperModules].sort(spineSort)[0];
    const lower = [...lowerModules].sort(spineSort)[0];
    emit(`  "${upper}" -> "${lower}" [style="invis" weight="1000"]`);
  }
  emit("");

  // Dependency edges
  for (const { from, to, violations, violationCount } of edges.values()) {
    const attrs = [];
    const boundaryViolations = violations.filter((v) => v !== "no-circular");

    if (boundaryViolations.length > 0) {
      const tip = `${boundaryViolations.join(", ")} (${violationCount} violations)`;
      attrs.push('color="red"', 'penwidth="2.0"');
      attrs.push(`tooltip="${tip}"`, `edgetooltip="${tip}"`);
    } else {
      attrs.push('color="#00000044"', 'penwidth="1.0"');
      attrs.push(`tooltip="${from} → ${to}"`, `edgetooltip="${from} → ${to}"`);
    }
    attrs.push('constraint="false"');
    emit(`  "${from}" -> "${to}" [${attrs.join(" ")}]`);
  }

  emit("}");
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Render dot → SVG
// ---------------------------------------------------------------------------

function renderSvg(dotSource) {
  return execSync("dot -Tsvg", { input: dotSource, encoding: "utf8" });
}

// ---------------------------------------------------------------------------
// Post-process SVG: inject violation arrow in legend + "Other modules" sidebar
// ---------------------------------------------------------------------------

function postProcessSvg(svg) {
  // Remove default graph title (shows "modules" tooltip on hover)
  svg = svg.replace(/<title>modules<\/title>\n?/, "");

  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) return svg;

  const [minX, minY, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);

  const injected = [];

  // --- Violation arrow in legend ---
  // Find the last tier legend node to position below it
  const lastLegendTier = (() => {
    // The legend collapses adjacent same-label tiers — walk tierOrder backwards
    // to find the last tier id that actually has a legend node.
    const seen = new Set();
    const order = [];
    for (const tierId of tierOrder) {
      const label = tiers[tierId].label;
      if (seen.has(label)) continue;
      seen.add(label);
      order.push(tierId);
    }
    return order[order.length - 1];
  })();
  const legendMatch = svg.match(
    new RegExp(
      `<title>legend_${lastLegendTier}<\\/title>\\s*<path[^>]*d="M([\\d.]+),([\\d.-]+)C`,
    ),
  );
  if (legendMatch) {
    const nodeBottom = parseFloat(legendMatch[2]) + 29;
    const arrowX1 = 32;
    const arrowX2 = 72;
    const arrowY = nodeBottom + 30;
    injected.push(
      `<g id="legend-violation">`,
      `  <defs><marker id="arrowhead-red" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="red"/></marker></defs>`,
      `  <line x1="${arrowX1}" y1="${arrowY}" x2="${arrowX2}" y2="${arrowY}" stroke="red" stroke-width="2" marker-end="url(#arrowhead-red)"/>`,
      `  <text x="${arrowX2 + 6}" y="${arrowY + 4}" font-family="Helvetica,sans-Serif" font-size="10" fill="#888888">violation</text>`,
      `</g>`,
    );
  }

  // --- "Other modules" sidebar ---
  const polyMatch = svg.match(
    /id="graph0"[^>]*>[\s\S]*?<polygon[^>]*points="([\d.,-\s]+)"/,
  );
  let graphRight = 520;
  let graphTop = -420;
  if (polyMatch) {
    const pts = polyMatch[1].split(/\s+/).map((p) => p.split(",").map(Number));
    graphRight = Math.max(...pts.map(([x]) => x));
    graphTop = Math.min(...pts.map(([, y]) => y));
  }

  const otherDirs = readdirSync("frontend/src/metabase", {
    withFileTypes: true,
  })
    .filter((d) => d.isDirectory() && !namedDirs.has(d.name))
    .map((d) => d.name)
    .sort();

  const lineHeight = 16;
  const padding = 12;
  const colWidth = 140;
  const colGap = 8;
  const headerHeight = 28;
  const rows = Math.ceil(otherDirs.length / 2);
  const boxWidth = colWidth * 2 + colGap + padding * 2;
  const boxHeight = rows * lineHeight + headerHeight + padding * 2;
  const boxX = graphRight + 20;
  const boxY = graphTop + 30;

  injected.push(
    `<g id="other-modules">`,
    `  <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="8" ry="8" fill="white" stroke="#cccccc" stroke-width="1"/>`,
    `  <text x="${boxX + boxWidth / 2}" y="${boxY + 20}" text-anchor="middle" font-family="Helvetica,sans-Serif" font-size="12" fill="#666666">Other Modules</text>`,
    `  <line x1="${boxX + padding}" y1="${boxY + headerHeight}" x2="${boxX + boxWidth - padding}" y2="${boxY + headerHeight}" stroke="#eeeeee" stroke-width="1"/>`,
    ...otherDirs.map((dir, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = boxX + padding + col * (colWidth + colGap);
      const y = boxY + headerHeight + padding + row * lineHeight + 12;
      return `  <text x="${x}" y="${y}" font-family="Helvetica,sans-Serif" font-size="10" fill="#888888">${dir}</text>`;
    }),
    `</g>`,
  );

  // Expand viewBox for the sidebar
  const newWidth = width + boxWidth + 60;
  const newHeight = Math.max(height, boxHeight + 40);

  svg = svg.replace(
    /viewBox="[^"]+"/,
    `viewBox="${minX} ${minY} ${newWidth} ${newHeight}"`,
  );
  svg = svg.replace(/\bwidth="[\d.]+pt"/, `width="${newWidth}pt"`);
  svg = svg.replace(/\bheight="[\d.]+pt"/, `height="${newHeight}pt"`);
  // Inject inside the graph transform group so coordinates match
  svg = svg.replace("</g>\n</svg>", injected.join("\n") + "\n</g>\n</svg>");

  return svg;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const dot = buildDot();
const svg = postProcessSvg(renderSvg(dot));
process.stdout.write(svg);
