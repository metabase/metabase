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

import { readdirSync } from "fs";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Map collapsed directory paths → short module names */
const moduleNames = {
  "frontend/src/metabase-types/": "types",
  "frontend/src/metabase-lib/": "mlv2",
  "frontend/src/metabase/lib/": "lib",
  "frontend/src/metabase/ui/": "ui",
  "frontend/src/metabase/api/": "api",
  "frontend/src/metabase/common/": "common",
  "frontend/src/metabase/querying/": "querying",
  "frontend/src/metabase/visualizations/": "visualizations",
  "frontend/src/metabase/dashboard/": "dashboard",
  "frontend/src/metabase/query_builder/": "query_builder",
  "frontend/src/metabase/admin/": "admin",
  "frontend/src/metabase/reference/": "reference",
};

const tierOrder = ["lib", "basic", "shared", "feature"];

const tiers = {
  lib: { label: "lib", color: "#e8f5e9", modules: ["types", "lib"] },
  basic: { label: "basic", color: "#e3f2fd", modules: ["mlv2", "ui", "api"] },
  shared: {
    label: "shared",
    color: "#fff3e0",
    modules: ["common", "querying", "visualizations"],
  },
  feature: {
    label: "feature",
    color: "#fce4ec",
    modules: ["dashboard", "query_builder", "admin", "reference"],
  },
  // app tier not yet implemented in linter
  // app: { label: "app", color: "#f3e5f5", modules: ["home", "nav"] },
};

/** Directories already assigned to a tier (including app, which isn't linted yet) */
const namedDirs = new Set([
  "lib",
  "ui",
  "api",
  "common",
  "querying",
  "visualizations",
  "dashboard",
  "query_builder",
  "admin",
  "reference",
  "app",
  "home",
  "nav",
]);

/** Invisible vertical spines that anchor the horizontal layout */
const spines = [
  ["types", "mlv2", "querying", "query_builder"],
  ["lib", "api", "visualizations", "reference"],
];

// ---------------------------------------------------------------------------
// Run depcruise & parse JSON
// ---------------------------------------------------------------------------

const moduleDirs = [
  "frontend/src/metabase/lib",
  "frontend/src/metabase/ui",
  "frontend/src/metabase/api",
  "frontend/src/metabase/common",
  "frontend/src/metabase/querying",
  "frontend/src/metabase/visualizations",
  "frontend/src/metabase/dashboard",
  "frontend/src/metabase/query_builder",
  "frontend/src/metabase/admin",
  "frontend/src/metabase/reference",
  "frontend/src/metabase-types",
  "frontend/src/metabase-lib",
];

const collapsePattern =
  "^frontend/src/(metabase-types|metabase-lib)/|^frontend/src/metabase/([^/]+)/";

const depcruiseCmd = [
  "bunx depcruise",
  ...moduleDirs,
  "--config .dependency-cruiser.mjs",
  "--output-type json",
].join(" ");

// Collapsed run for edges, uncollapsed for accurate violation counts
const collapsed = JSON.parse(
  execSync(`${depcruiseCmd} --collapse '${collapsePattern}'`, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }),
);
const uncollapsed = JSON.parse(
  execSync(depcruiseCmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }),
);

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
// Collect edges from collapsed output + violation counts from uncollapsed
// ---------------------------------------------------------------------------

/** Resolve a file path to its module name */
function resolveModule(filePath) {
  for (const [prefix, name] of Object.entries(moduleNames)) {
    if (filePath.startsWith(prefix)) return name;
  }
  return null;
}

// Count violations per edge from uncollapsed data
const violationCounts = new Map();
for (const mod of uncollapsed.modules) {
  const fromName = resolveModule(mod.source);
  if (!fromName) continue;

  for (const dep of mod.dependencies) {
    const toName = resolveModule(dep.resolved);
    if (!toName || toName === fromName) continue;

    const boundaryRules = (dep.rules ?? []).filter(
      (r) => r.name !== "no-circular",
    );
    if (boundaryRules.length > 0) {
      const key = `${fromName}->${toName}`;
      violationCounts.set(key, (violationCounts.get(key) ?? 0) + 1);
    }
  }
}

const edges = new Map();

for (const mod of collapsed.modules) {
  const fromName = moduleNames[mod.source];
  if (!fromName) continue;

  for (const dep of mod.dependencies) {
    const toName = moduleNames[dep.resolved];
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
      edge.violationCount = violationCounts.get(key) ?? 0;
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

  // Graph attributes
  emit("digraph modules {");
  emit('  rankdir="TB"');
  emit('  newrank="true"');
  emit('  splines="line"');
  emit('  outputorder="edgesfirst"');
  emit('  nodesep="0.4"');
  emit('  ranksep="1.0"');
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
  for (const tierId of tierOrder) {
    const { label, color } = tiers[tierId];
    emit(
      `      "legend_${tierId}" [label="${label}" fillcolor="${color}" width="1.0"]`,
    );
  }
  const legendChain = tierOrder.map((t) => `"legend_${t}"`).join(" -> ");
  emit(`      ${legendChain} [style="invis"]`);
  emit("    }");
  emit("  }");
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

  // rank=same subgraphs — one row per tier
  for (const tierId of tierOrder) {
    const { modules } = tiers[tierId];
    emit(`  subgraph tier_${tierId} {`);
    emit('    rank="same"');
    for (const mod of modules) {
      emit(`    "${mod}"`);
    }
    emit("  }");
    emit("");
  }

  // Invisible spines for horizontal anchoring
  for (const spine of spines) {
    for (let i = 0; i < spine.length - 1; i++) {
      emit(`  "${spine[i]}" -> "${spine[i + 1]}" [style="invis" weight="100"]`);
    }
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
  // Find the legend_feature node (last tier box) to position below it
  const featureMatch = svg.match(
    /<title>legend_feature<\/title>\s*<path[^>]*d="M([\d.]+),([\d.-]+)C/,
  );
  if (featureMatch) {
    // legend_feature top-left corner; the node bottom is ~29px below
    const nodeBottom = parseFloat(featureMatch[2]) + 29;
    // Center the arrow on the legend (legend is roughly x=24..96)
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
  // Find the graph's internal bounding box from the background polygon
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
