// Joins a reach index and a kills file into one row per code location: the e2e tests that reach it and assert after,
// the mutants planted there, their confirmed killers per layer, and the cheapest layer that kills each.
//   node ledger.mjs --index <index dir> --kills <kills file> --kills-base <commit> --out <dir>
//                   [--locations <reach-counts.jsonl>] [--candidates <file or test id> ...] [--mutants-dir <dir>]
//                   [--allow-mixed] [--repo <path>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./args.mjs";
import { keysReachedBy, loadIndex, query, resolveLocation } from "./lib.mjs";
import {
  fnmapIndexFor,
  gitShow,
  listJsFunctions,
  repoRoot,
} from "./source.mjs";

// Cheapest first. The type checker and the contract checker together are the checker layer.
export const LAYERS = ["tsc", "contract", "jest", "deftest", "e2e"];
const TEST_LAYERS = ["jest", "deftest", "e2e"];

export function layerOf(testId) {
  const sep = testId.indexOf("::");
  if (sep === -1) {
    return /^[\w-]+(\.[\w-]+)+\/[^\s/]+$/.test(testId) ? "deftest" : "unknown";
  }
  const spec = testId.slice(0, sep);
  if (/\.cy\.(spec\.)?[cm]?[jt]sx?$/.test(spec)) {
    return "e2e";
  }
  if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(spec)) {
    return "jest";
  }
  return "unknown";
}

const LOCATION_FIELDS = ["file", "fn", "line", "column", "ns", "var"];

/** Its `locations`, else its `location`, else a location made of its own file, fn, line, column, ns and var. */
export function mutantLocations(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return [];
  }
  if (entry.locations?.length) {
    return entry.locations;
  }
  if (entry.location) {
    return [entry.location];
  }
  const own = Object.fromEntries(
    LOCATION_FIELDS.filter((k) => entry[k] != null).map((k) => [k, entry[k]]),
  );
  return own.file != null || own.ns != null ? [own] : [];
}

/** Test ids, from each value that is a file and otherwise from the value itself. */
export function readCandidates(values) {
  const ids = [];
  for (const value of values) {
    if (!fs.existsSync(value) || !fs.statSync(value).isFile()) {
      ids.push(value);
      continue;
    }
    const text = fs.readFileSync(value, "utf8");
    if (text.trimStart().startsWith("[")) {
      ids.push(...JSON.parse(text));
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("{")) {
        const row = JSON.parse(line);
        ids.push(row.deleted_test || row.id);
      } else if (line) {
        ids.push(line);
      }
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

function byLayer(ids = []) {
  const out = {};
  for (const id of new Set(ids)) {
    (out[layerOf(id)] ??= []).push(id);
  }
  return out;
}

const countBy = (groups) =>
  Object.fromEntries(
    Object.entries(groups).map(([layer, ids]) => [layer, ids.length]),
  );

const firstLayer = (groups) =>
  LAYERS.find((layer) => groups[layer]?.length) ?? "none";

function e2eStatus(entry, killed, unconfirmed, ran, errored) {
  if (killed.e2e?.length) {
    return "killed";
  }
  if (unconfirmed.e2e?.length) {
    return "killed once, not confirmed";
  }
  if (ran.e2e?.length) {
    const failed = new Set(errored.e2e ?? []);
    return ran.e2e.every((id) => failed.has(id)) ? "errored" : "miss";
  }
  return entry.e2e_runs?.length ? "dispatched, no test ran" : "not run";
}

/** `killed_at_layer` when `kill_confirmed` is true, none when it's false, and null in an older kills file without `kill_confirmed`. */
function recordedLayer(mid, entry) {
  if (typeof entry.kill_confirmed !== "boolean") {
    return null;
  }
  if (!entry.kill_confirmed) {
    return "none";
  }
  if (!LAYERS.includes(entry.killed_at_layer)) {
    throw new Error(
      `${mid}: kill_confirmed is true, but killed_at_layer ${JSON.stringify(entry.killed_at_layer)} is none of ${LAYERS.join(", ")}`,
    );
  }
  return entry.killed_at_layer;
}

export const SYMPTOM_FIELDS = {
  symptom_kills: "killed_by",
  symptom_unconfirmed_by: "unconfirmed_by",
};

/** Per symptom field, its ids that are in the field it marks, and how many of its ids aren't. */
function symptomIds(entry) {
  const out = {};
  for (const [field, within] of Object.entries(SYMPTOM_FIELDS)) {
    const marked = new Set(entry[within] ?? []);
    const ids = [...new Set(entry[field] ?? [])];
    out[field] = {
      ids: ids.filter((id) => marked.has(id)),
      ignored: ids.filter((id) => !marked.has(id)).length,
    };
  }
  return out;
}

/**
 * Whether the kills a mutant rests on, its confirmed kills at any layer or its unconfirmed ones when it has none, are all symptom kills.
 * Null when it has neither.
 */
function restsOnlyOnSymptomKills(killed, unconfirmed, symptom) {
  const confirmed = Object.values(killed).flat();
  const [killers, marked] = confirmed.length
    ? [confirmed, symptom.symptom_kills.ids]
    : [Object.values(unconfirmed).flat(), symptom.symptom_unconfirmed_by.ids];
  if (killers.length === 0) {
    return null;
  }
  const flagged = new Set(marked);
  return killers.every((id) => flagged.has(id));
}

export function mutantFacts(mid, raw, sidecar) {
  const entry = Array.isArray(raw) ? { killed_by: raw } : raw;
  const killed = byLayer(entry.killed_by);
  const unconfirmed = byLayer(entry.unconfirmed_by);
  const errored = byLayer(entry.errored);
  const ran = byLayer(entry.ran);
  const symptom = symptomIds(entry);
  const typecheck = entry.typecheck ?? sidecar?.typecheck ?? null;
  if (typecheck === "fails") {
    killed.tsc = ["tsc"];
  }
  const contract = entry.layer_results?.contract;
  if (contract?.result === "killed") {
    killed.contract = contract.killed_by?.length
      ? contract.killed_by
      : ["contract"];
  }
  const recomputed = firstLayer(killed);
  const recorded = recordedLayer(mid, entry);
  const contractResult =
    contract?.result ?? (entry.layers_run ? "not run" : null);
  const testKillers = TEST_LAYERS.flatMap((layer) => killed[layer] ?? []);
  const witnesses = new Set(entry.witness_tests ?? []);
  let witnessOnly = null;
  if (testKillers.length > 0) {
    witnessOnly = testKillers.every((id) => witnesses.has(id));
  }
  const failed = new Set([...testKillers, ...(entry.errored ?? [])]);
  return {
    stratum: entry.stratum ?? null,
    ...(entry.stratum_coarse ? { stratum_coarse: entry.stratum_coarse } : {}),
    origin: entry.origin ?? null,
    ...(entry.set ? { set: entry.set } : {}),
    ...(entry.alias_of ? { alias_of: entry.alias_of } : {}),
    ...(sidecar?.description ? { description: sidecar.description } : {}),
    locations: mutantLocations(entry),
    ...(entry.locations_note ? { locations_note: entry.locations_note } : {}),
    rows: [],
    ran_known: entry.ran != null,
    tsc: typecheck ?? "not recorded",
    unit_result: entry.unit_result ?? null,
    killed_by: killed,
    unconfirmed_by: unconfirmed,
    symptom_kills: byLayer(symptom.symptom_kills.ids),
    symptom_unconfirmed_by: byLayer(symptom.symptom_unconfirmed_by.ids),
    symptom_only: restsOnlyOnSymptomKills(killed, unconfirmed, symptom),
    ...(symptom.symptom_kills.ignored || symptom.symptom_unconfirmed_by.ignored
      ? {
          symptom_ids_ignored: Object.fromEntries(
            Object.keys(SYMPTOM_FIELDS).map((f) => [f, symptom[f].ignored]),
          ),
        }
      : {}),
    errored,
    ran: countBy(ran),
    ran_e2e: ran.e2e ?? [],
    misses: [...new Set(entry.ran ?? [])].filter((id) => !failed.has(id))
      .length,
    e2e_status: e2eStatus(entry, killed, unconfirmed, ran, errored),
    cheapest_layer: recorded ?? recomputed,
    cheapest_layer_source: recorded == null ? "recomputed" : "killed_at_layer",
    ...(recorded != null && recorded !== recomputed
      ? { recomputed_layer: recomputed }
      : {}),
    unconfirmed_layer: firstLayer(unconfirmed),
    witness_only: witnessOnly,
    ...(entry.routed_to ? { routed_to: entry.routed_to } : {}),
    ...(contractResult ? { contract: contractResult } : {}),
  };
}

/** Where the kills file records its own cheapest layer, the mutants on which it differs from the one derived here. */
function recordedLayerDifferences(kills, mutants) {
  const differ = [];
  let compared = 0;
  for (const [mid, raw] of Object.entries(kills)) {
    const recorded = Array.isArray(raw) ? null : raw.cheapest_layer;
    if (recorded == null) {
      continue;
    }
    compared += 1;
    const m = mutants[mid];
    const unconfirmed = raw.cheapest_layer_unconfirmed ?? "none";
    const derived = m.cheapest_layer === "none" ? m.unconfirmed_layer : "none";
    if (recorded !== m.cheapest_layer || unconfirmed !== derived) {
      differ.push({
        mutant: mid,
        recorded: [recorded, unconfirmed],
        derived: [m.cheapest_layer, derived],
      });
    }
  }
  return { compared, differ };
}

function killedAtLayerDifferences(mutants) {
  const fromFile = Object.entries(mutants).filter(
    ([, m]) => m.cheapest_layer_source === "killed_at_layer",
  );
  return {
    compared: fromFile.length,
    differ: fromFile
      .filter(([, m]) => m.recomputed_layer != null)
      .map(([mid, m]) => ({
        mutant: mid,
        killed_at_layer: m.cheapest_layer,
        recomputed: m.recomputed_layer,
      })),
  };
}

function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const revParse = (repo, rev) =>
  rev
    ? git(repo, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])
    : null;

/**
 * The index and the kills file share a base when the kills base is the captured commit, or the app commit the capture branch sits on.
 * In the second case the files the capture branch changes are listed, and rows in them are marked mixed.
 */
function checkBase(repo, killsBase, meta) {
  const kills = revParse(repo, killsBase);
  const indexSha = revParse(repo, meta.sha);
  const appBase = revParse(repo, meta.appBase);
  const base = {
    kills_base: kills ?? killsBase,
    index_sha: indexSha ?? meta.sha,
    index_app_base: appBase ?? meta.appBase ?? null,
    changed_between: [],
  };
  if (!kills || !indexSha) {
    return {
      ...base,
      status: "mixed",
      reason: `can't resolve ${kills ? meta.sha : killsBase} in ${repo}`,
    };
  }
  if (kills === indexSha) {
    return {
      ...base,
      status: "same",
      reason: "the kills base is the captured commit",
    };
  }
  if (kills === appBase) {
    const changed = git(repo, ["diff", "--name-only", kills, indexSha]);
    return {
      ...base,
      status: "same",
      reason:
        "the kills base is the app commit the capture branch sits on. Rows in files the capture branch changes are marked mixed",
      changed_between: changed ? changed.split("\n") : [],
    };
  }
  return {
    ...base,
    status: "mixed",
    reason: "the kills base is neither the captured commit nor its app commit",
  };
}

const isAnonymous = (name) => /^\(anonymous/.test(name ?? "");

/**
 * Per file, each function's Istanbul name, or its source display name, such as `Foo > useEffect callback@12`, where Istanbul has none.
 * Also counts each name, since a name used twice in a file needs the function's position to tell the two apart.
 */
function functionNames(index, ctx) {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) {
      const fnmap = index.fnmap[file] ?? {};
      const names = new Map(
        Object.entries(fnmap).map(([i, entry]) => [i, entry.name]),
      );
      const source = [...names.values()].some(isAnonymous)
        ? gitShow(ctx.repo, ctx.sha, file)
        : null;
      if (source != null) {
        for (const fn of listJsFunctions(ctx.repo, file, source)) {
          const i = fnmapIndexFor(fnmap, fn);
          if (i != null && isAnonymous(names.get(String(i)))) {
            names.set(String(i), fn.display);
          }
        }
      }
      const counts = new Map();
      names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
      cache.set(file, { names, counts });
    }
    return cache.get(file);
  };
}

function formVar(form) {
  if (form.kind === "def" && form.name) {
    return form.name;
  }
  if (form.kind === "defmethod") {
    return `${form.multi} ${form.dispatch}`;
  }
  if (form.kind === "endpoint") {
    return `${form.method} ${form.route}`;
  }
  return `${form.op ?? "form"}@${form.startLine}`;
}

/** The row a location belongs to: a frontend function Istanbul counts, or a backend top-level form. */
function identify(loc, r, namesIn) {
  if (r.kind === "frontend" && r.functions.length > 0) {
    if (r.via === "whole file") {
      return { id: loc.file, location: { file: loc.file } };
    }
    const fns = [
      ...new Map(r.functions.map((f) => [f.fnIndex, f])).values(),
    ].sort((a, b) => a.fnIndex - b.fnIndex);
    const { names, counts } = namesIn(loc.file);
    const named = fns.map((f) => {
      const name = names.get(String(f.fnIndex)) ?? f.name;
      return {
        name,
        key: counts.get(name) > 1 ? `${name}@${f.line}:${f.column}` : name,
      };
    });
    return {
      id: `${loc.file}#${named.map((n) => n.key).join(" + ")}`,
      location: {
        file: loc.file,
        fn: named.map((n) => n.name).join(" + "),
        line: fns[0].line,
        column: fns[0].column,
      },
    };
  }
  if (r.kind === "backend" && r.ns) {
    if (r.form) {
      const v = formVar(r.form);
      return {
        id: `${r.ns}/${v}`,
        location: {
          ns: r.ns,
          var: v,
          file: loc.file ?? null,
          line: r.form.startLine,
        },
      };
    }
    if (loc.var) {
      return {
        id: `${r.ns}/${loc.var}`,
        location: {
          ns: r.ns,
          var: loc.var,
          ...(loc.file ? { file: loc.file } : {}),
        },
      };
    }
    return { id: r.ns, location: { ns: r.ns } };
  }
  if (loc.ns && loc.var) {
    return { id: `${loc.ns}/${loc.var}`, location: loc };
  }
  const where = loc.fn ? `#${loc.fn}` : loc.line != null ? `:${loc.line}` : "";
  return { id: `${loc.file ?? loc.ns}${where}`, location: loc };
}

const isSdkFile = (file) => /(^|\/)embedding-sdk/.test(file ?? "");

export function buildLedger({
  index,
  ctx,
  kills,
  base,
  reachCounts = [],
  candidates = [],
  sidecars = {},
}) {
  const namesIn = functionNames(index, ctx);
  const rows = new Map();
  const resolved = new Map();

  function rowOf(loc) {
    const key = JSON.stringify(loc);
    if (!resolved.has(key)) {
      let r;
      try {
        r = resolveLocation(index, loc, ctx);
      } catch (error) {
        r = { kind: "unknown", keys: [], notes: [error.message] };
      }
      const { id, location } = identify(loc, r, namesIn);
      if (!rows.has(id)) {
        rows.set(id, {
          id,
          kind: r.kind,
          location,
          keys: new Set(),
          notes: new Set(),
          inputs: [],
          issues: new Set(),
          mutants: [],
        });
      }
      const row = rows.get(id);
      r.keys.forEach((k) => row.keys.add(k));
      (r.notes ?? []).forEach((n) => row.notes.add(n));
      if (r.keys.length === 0 && isSdkFile(loc.file)) {
        row.notes.add("embedding SDK code");
      }
      if (r.keys.length === 0 && r.form && !r.notes?.length) {
        row.notes.add("no class of this form is in the coverage");
      }
      row.inputs.push(loc);
      resolved.set(key, row);
    }
    return resolved.get(key);
  }

  for (const line of reachCounts) {
    for (const loc of line.locations ?? []) {
      const row = rowOf(loc);
      if (line.issue != null) {
        row.issues.add(line.issue);
      }
    }
  }

  const mutants = {};
  const unlocated = [];
  for (const [mid, raw] of Object.entries(kills)) {
    const facts = mutantFacts(mid, raw, sidecars[mid]);
    mutants[mid] = facts;
    if (facts.locations.length === 0) {
      unlocated.push(mid);
      continue;
    }
    for (const loc of facts.locations) {
      const row = rowOf(loc);
      if (!row.mutants.includes(mid)) {
        row.mutants.push(mid);
        facts.rows.push(row.id);
      }
    }
  }

  const testIndex = new Map(index.tests.map((t, i) => [t.id, i]));
  const candidateSet = new Set(candidates);
  const changed = new Set(base.changed_between);
  const mixed = (file) => base.status === "mixed" || changed.has(file);
  const out = [];
  const passed = (r) => index.tests[testIndex.get(r.id)].state === "passed";
  const pairs = (rs) =>
    rs.map((r) => [
      testIndex.get(r.id),
      r.assertsAfter,
      ...(r.load ? [r.load] : []),
    ]);
  const byLoad = (rs) =>
    rs.reduce((acc, r) => ({ ...acc, [r.load]: (acc[r.load] ?? 0) + 1 }), {});
  for (const row of rows.values()) {
    const { reach, byBasis } = query(index, [...row.keys], {
      includeNotPassing: true,
    });
    const split = {};
    const counts = {};
    for (const [basis, name] of [
      ["subtraction", "measured"],
      ["baseline", "baseline"],
    ]) {
      const rs = byBasis[basis].reach;
      const asserting = rs.filter((r) => passed(r) && r.assertsAfter > 0);
      const remaining = rs.filter((r) => passed(r) && !candidateSet.has(r.id));
      split[`reach_and_assert_${name}`] = pairs(asserting);
      split[`reach_other_${name}`] = pairs(
        rs.filter((r) => !(passed(r) && r.assertsAfter > 0)),
      );
      counts[`reach_${name}`] = rs.filter(passed).length;
      counts[`reach_and_assert_${name}`] = asserting.length;
      counts[`remaining_reach_${name}`] = remaining.length;
      counts[`remaining_reach_and_assert_${name}`] = remaining.filter(
        (r) => r.assertsAfter > 0,
      ).length;
      if (basis === "baseline") {
        counts.reach_baseline_by_load = byLoad(rs.filter(passed));
        counts.reach_and_assert_baseline_by_load = byLoad(asserting);
        counts.remaining_reach_and_assert_baseline_by_load = byLoad(
          remaining.filter((r) => r.assertsAfter > 0),
        );
      }
    }
    const rowMutants = row.mutants.map((mid) => {
      const m = mutants[mid];
      return {
        id: mid,
        stratum: m.stratum,
        origin: m.origin,
        ...(m.routed_to ? { routed_to: m.routed_to } : {}),
        killed_by: m.killed_by,
        ...(Object.keys(m.unconfirmed_by).length
          ? { unconfirmed_by: m.unconfirmed_by }
          : {}),
        ...(Object.keys(m.symptom_kills).length
          ? { symptom_kills: m.symptom_kills }
          : {}),
        ...(Object.keys(m.symptom_unconfirmed_by).length
          ? { symptom_unconfirmed_by: m.symptom_unconfirmed_by }
          : {}),
        ...(m.symptom_only ? { symptom_only: true } : {}),
        cheapest_layer: m.cheapest_layer,
      };
    });
    const unkilled = rowMutants.filter((m) => m.cheapest_layer === "none");
    out.push({
      id: row.id,
      kind: row.kind,
      location: row.location,
      resolved: row.keys.size > 0,
      keys: row.keys.size,
      ...(row.notes.size ? { notes: [...row.notes] } : {}),
      ...(mixed(row.location.file) ? { base: "mixed" } : {}),
      inputs: row.inputs,
      reach_counts_issues: [...row.issues],
      ...split,
      counts: {
        ...counts,
        not_passing: reach.length - reach.filter(passed).length,
        candidates_reaching: reach.filter((r) => candidateSet.has(r.id)).length,
      },
      mutants: rowMutants,
      status:
        rowMutants.length === 0
          ? "no mutants"
          : unkilled.length === 0
            ? "all killed"
            : unkilled.length === rowMutants.length
              ? "none killed"
              : "some killed",
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  base.mixed_rows = out.filter((row) => row.base === "mixed").length;

  return {
    format: "location-ledger prototype",
    base,
    layers: LAYERS,
    tests: index.tests.map((t) => ({ id: t.id, state: t.state })),
    candidate_keys: Object.fromEntries(keysReachedBy(index, candidates)),
    rows: out,
    mutants,
    unlocated_mutants: unlocated,
    recorded_cheapest_layer: recordedLayerDifferences(kills, mutants),
    killed_at_layer: killedAtLayerDifferences(mutants),
    reach_counts_lines_without_locations: reachCounts
      .filter((line) => !line.locations?.length)
      .map((line) => ({
        issue: line.issue ?? null,
        deleted_test: line.deleted_test,
        note: line.note ?? null,
      })),
  };
}

/**
 * The demand list and the e2e floor, per mutant and per row, grouped by stratum.
 * Each group's `symptom_only` lists the mutants in it that rest only on symptom kills.
 */
export function derive(ledger) {
  const { mutants, rows } = ledger;
  const group = (pick) => {
    const byStratum = {};
    for (const [mid, m] of Object.entries(mutants)) {
      if (!pick(m)) {
        continue;
      }
      const g = (byStratum[m.stratum ?? "no stratum"] ??= {
        mutants: [],
        rows: new Set(),
        symptomOnly: [],
      });
      g.mutants.push(mid);
      if (m.symptom_only) {
        g.symptomOnly.push(mid);
      }
      m.rows.forEach((id) => g.rows.add(id));
    }
    return Object.fromEntries(
      Object.entries(byStratum)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([s, g]) => [
          s,
          {
            mutants: g.mutants.sort(),
            rows: [...g.rows].sort(),
            symptom_only: g.symptomOnly.sort(),
          },
        ]),
    );
  };
  const rowsWith = (pick) =>
    rows.filter((row) => row.mutants.some(pick)).length;
  return {
    demand: group((m) => m.cheapest_layer === "none"),
    demand_rows_without_any_killer: rows.filter(
      (r) => r.status === "none killed",
    ).length,
    demand_rows_with_an_unkilled_mutant: rowsWith(
      (m) => m.cheapest_layer === "none",
    ),
    e2e_floor: group((m) => m.cheapest_layer === "e2e"),
    e2e_floor_rows: rowsWith((m) => m.cheapest_layer === "e2e"),
    e2e_floor_unconfirmed: group(
      (m) => m.cheapest_layer === "none" && m.unconfirmed_layer === "e2e",
    ),
    e2e_floor_unconfirmed_rows: rows.filter((row) =>
      row.mutants.some(
        (rm) =>
          rm.cheapest_layer === "none" &&
          mutants[rm.id].unconfirmed_layer === "e2e",
      ),
    ).length,
    e2e_floor_routed: group((m) => m.routed_to === "e2e"),
  };
}

const CSV_COLUMNS = [
  "location_id",
  "mutant",
  "stratum",
  "origin",
  "location",
  "description",
  "tsc",
  "unit_result",
  "killed_by_layers",
  "killed_by_first",
  "ran_layers",
  "misses",
  "errored",
  "e2e_status",
  "candidates_reaching",
  "e2e_reach_measured",
  "e2e_reach_and_assert_measured",
  "e2e_reach_baseline",
  "e2e_reach_and_assert_baseline",
  "e2e_reach_and_assert_baseline_by_load",
  "reach_source",
  "cheapest_killing_layer",
  "witness_only",
  "unconfirmed_by_layers",
  "unconfirmed_layer",
  "resolved",
  "location_notes",
  "reach_counts_issues",
  "base",
  "stratum_coarse",
  "routed_to",
  "e2e_reach_measured_total",
  "e2e_reach_and_assert_measured_total",
  "e2e_reach_baseline_total",
  "e2e_reach_and_assert_baseline_total",
  "e2e_reach_and_assert_baseline_by_load_total",
  "contract",
  "cheapest_layer_source",
  "symptom_kills_layers",
  "symptom_unconfirmed_by_layers",
  "symptom_only",
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const layerCounts = (counts) =>
  LAYERS.concat("unknown")
    .filter((layer) => counts[layer])
    .map((layer) => `${layer}=${counts[layer]}`)
    .join(";");

const loadCounts = (counts) =>
  Object.entries(counts)
    .map(([load, n]) => `${load}=${n}`)
    .join(";");

function locationText(location) {
  if (location.ns) {
    return `${location.ns}/${location.var ?? ""}`;
  }
  const fn = location.fn ? `#${location.fn}` : "";
  const line = location.line != null ? `@${location.line}` : "";
  return `${location.file}${fn}${line}`;
}

/** One line per location and mutant, so a location with several mutants spans several lines and one with none has one. */
export function toCsv(ledger) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of ledger.rows) {
    const shared = {
      location_id: row.id,
      location: locationText(row.location),
      candidates_reaching: row.counts.candidates_reaching,
      e2e_reach_measured: row.counts.remaining_reach_measured,
      e2e_reach_and_assert_measured:
        row.counts.remaining_reach_and_assert_measured,
      e2e_reach_baseline: row.counts.remaining_reach_baseline,
      e2e_reach_and_assert_baseline:
        row.counts.remaining_reach_and_assert_baseline,
      e2e_reach_measured_total: row.counts.reach_measured,
      e2e_reach_and_assert_measured_total: row.counts.reach_and_assert_measured,
      e2e_reach_baseline_total: row.counts.reach_baseline,
      e2e_reach_and_assert_baseline_total: row.counts.reach_and_assert_baseline,
      e2e_reach_and_assert_baseline_by_load: loadCounts(
        row.counts.remaining_reach_and_assert_baseline_by_load,
      ),
      e2e_reach_and_assert_baseline_by_load_total: loadCounts(
        row.counts.reach_and_assert_baseline_by_load,
      ),
      reach_source: "index",
      resolved: row.resolved ? "yes" : "no",
      location_notes: (row.notes ?? []).join(" | "),
      reach_counts_issues: row.reach_counts_issues.join(";"),
      base: row.base ?? ledger.base.status,
    };
    const perMutant = row.mutants.length
      ? row.mutants.map(({ id }) => {
          const m = ledger.mutants[id];
          const killers = LAYERS.flatMap((layer) => m.killed_by[layer] ?? []);
          return {
            mutant: id,
            stratum: m.stratum,
            origin: m.origin,
            description: m.description,
            tsc: m.tsc,
            unit_result: m.unit_result,
            killed_by_layers: layerCounts(countBy(m.killed_by)),
            killed_by_first: killers[0],
            ran_layers: layerCounts(m.ran),
            misses: m.misses,
            errored: Object.values(m.errored).flat().length,
            e2e_status: m.e2e_status,
            cheapest_killing_layer: m.cheapest_layer,
            witness_only:
              m.witness_only == null ? "" : m.witness_only ? "yes" : "no",
            unconfirmed_by_layers: layerCounts(countBy(m.unconfirmed_by)),
            unconfirmed_layer:
              m.unconfirmed_layer === "none" ? "" : m.unconfirmed_layer,
            stratum_coarse: m.stratum_coarse,
            routed_to: m.routed_to,
            contract: m.contract,
            cheapest_layer_source: m.cheapest_layer_source,
            symptom_kills_layers: layerCounts(countBy(m.symptom_kills ?? {})),
            symptom_unconfirmed_by_layers: layerCounts(
              countBy(m.symptom_unconfirmed_by ?? {}),
            ),
            symptom_only:
              m.symptom_only == null ? "" : m.symptom_only ? "yes" : "no",
          };
        })
      : [{ cheapest_killing_layer: "no mutant" }];
    for (const cells of perMutant) {
      const all = { ...shared, ...cells };
      lines.push(CSV_COLUMNS.map((c) => csvCell(all[c])).join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}

function strataLine(groups) {
  const parts = Object.entries(groups).map(
    ([s, g]) => `${s} ${g.mutants.length} mutants in ${g.rows.length} rows`,
  );
  return parts.length ? parts.join(", ") : "none";
}

function symptomLine(groups) {
  const parts = Object.entries(groups)
    .filter(([, g]) => g.symptom_only.length)
    .map(([s, g]) => `${s} ${g.symptom_only.length}`);
  const n = Object.values(groups).reduce(
    (sum, g) => sum + g.symptom_only.length,
    0,
  );
  return n
    ? `${n} of them rest only on symptom kills: ${parts.join(", ")}.`
    : "None of them rests only on symptom kills.";
}

function symptomCounts(mutants) {
  const all = Object.values(mutants);
  const ids = (m, field) => Object.values(m[field] ?? {}).flat().length;
  const sum = (f) => all.reduce((n, m) => n + f(m), 0);
  return {
    kills: sum((m) => ids(m, "symptom_kills")),
    killed: sum((m) => (ids(m, "symptom_kills") ? 1 : 0)),
    unconfirmed: sum((m) => ids(m, "symptom_unconfirmed_by")),
    unconfirmedMutants: sum((m) => (ids(m, "symptom_unconfirmed_by") ? 1 : 0)),
    restingOnly: sum((m) => (m.symptom_only ? 1 : 0)),
    ignored: Object.fromEntries(
      Object.keys(SYMPTOM_FIELDS).map((f) => [
        f,
        sum((m) => m.symptom_ids_ignored?.[f] ?? 0),
      ]),
    ),
  };
}

export function summarize(ledger, derived, inputs) {
  const { rows, mutants } = ledger;
  const count = (xs, f) => xs.filter(f).length;
  const statuses = {};
  rows.forEach((r) => (statuses[r.status] = (statuses[r.status] ?? 0) + 1));
  const fromReachCounts = rows.filter((r) => r.reach_counts_issues.length);
  const unresolved = rows.filter((r) => !r.resolved);
  const baselineRows = rows.filter((r) => r.counts.reach_baseline > 0);
  const sumLoads = (rs) =>
    rs.reduce((acc, r) => {
      for (const [load, n] of Object.entries(r.counts.reach_baseline_by_load)) {
        acc[load] = (acc[load] ?? 0) + n;
      }
      return acc;
    }, {});
  const cheapest = {};
  Object.values(mutants).forEach(
    (m) => (cheapest[m.cheapest_layer] = (cheapest[m.cheapest_layer] ?? 0) + 1),
  );
  const recorded = ledger.recorded_cheapest_layer;
  const atLayer = ledger.killed_at_layer;
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const routed = {};
  Object.values(derived.demand)
    .flatMap((g) => g.mutants)
    .forEach((mid) => {
      const r = mutants[mid].routed_to ?? "not routed";
      routed[r] = (routed[r] ?? 0) + 1;
    });
  const unknownIds = Object.values(mutants).reduce(
    (n, m) =>
      n +
      (m.killed_by.unknown?.length ?? 0) +
      (m.unconfirmed_by.unknown?.length ?? 0) +
      (m.ran.unknown ?? 0),
    0,
  );
  const symptom = symptomCounts(mutants);
  const hasSymptoms =
    symptom.kills +
      symptom.unconfirmed +
      Object.values(symptom.ignored).reduce((a, b) => a + b, 0) >
    0;
  const lines = [
    "# Location ledger",
    "",
    `Base: ${ledger.base.status}, ${ledger.base.mixed_rows} rows marked mixed. Kills base ${ledger.base.kills_base.slice(0, 11)}, index ${ledger.base.index_sha.slice(0, 11)} (app commit ${String(ledger.base.index_app_base).slice(0, 11)}): ${ledger.base.reason}.`,
    `Inputs: ${inputs.kills} mutants, ${inputs.reachCountsLines} reach-counts lines, ${inputs.candidates} candidates, index runs ${inputs.runs.join(", ")}.`,
    "",
    "A location is a frontend function with its own Istanbul counter, `{file, fn}`, or a backend top-level form, `{ns, var}`.",
    "Every input location is resolved through the lookup library, and mutants and reach-counts locations that resolve to the same function or form share a row.",
    "Reach counts only tests that passed in the capture, and splits by basis. The `_measured` counts are reach after baseline subtraction, basis `subtraction`.",
    "The `_baseline` counts are reach through code that subtraction removes from every test, basis `baseline`: every test that loaded the app, or made an app request for backend code, counts as reaching it.",
    "A test that reaches a row both ways counts under both. In the CSV, `e2e_reach_*` and `e2e_reach_and_assert_*` leave out the candidates, and the `_total` columns keep them.",
    "Baseline reach is split by the kind of top-window page the test loaded, `app`, `embed`, `public`, `other`, or `unknown` when the index records no pages. Reach from a load other than `app` is the least certain.",
    "",
    "## Rows",
    "",
    `- ${rows.length} rows, ${count(rows, (r) => r.kind === "frontend")} frontend and ${count(rows, (r) => r.kind === "backend")} backend: ${fromReachCounts.length} hold a reach-counts location, ${count(rows, (r) => r.mutants.length)} hold a mutant, ${count(rows, (r) => r.mutants.length && r.reach_counts_issues.length)} hold both.`,
    `- Status: ${Object.entries(statuses)
      .map(([s, n]) => `${s} ${n}`)
      .join(", ")}.`,
    `- ${baselineRows.length} rows have reach with basis baseline, ${count(baselineRows, (r) => r.counts.reach_measured > 0)} of them measured reach too, and ${count(baselineRows, (r) => r.mutants.length)} of them hold a mutant. Their baseline reach by load: ${
      Object.entries(sumLoads(baselineRows))
        .map(([load, n]) => `${load} ${n}`)
        .join(", ") || "none"
    }.`,
    `- ${unresolved.length} rows resolve to no code, so no test reaches them:`,
    ...unresolved.map(
      (r) => `  - \`${r.id}\`: ${(r.notes ?? ["no notes"]).join(" | ")}`,
    ),
    `- ${ledger.reach_counts_lines_without_locations.length} reach-counts lines have no location and get no row:`,
    ...ledger.reach_counts_lines_without_locations.map(
      (l) => `  - ${l.deleted_test}: ${l.note ?? "no note"}`,
    ),
    "",
    "## Mutants",
    "",
    `- ${Object.keys(mutants).length} mutants, ${ledger.unlocated_mutants.length} without a location, so they sit in no row.`,
    `- Cheapest confirmed layer: ${LAYERS.concat("none")
      .filter((l) => cheapest[l])
      .map((l) => `${l} ${cheapest[l]}`)
      .join(", ")}.`,
    `- Unconfirmed killers: ${count(Object.values(mutants), (m) => Object.keys(m.unconfirmed_by).length)} mutants, kept out of the cheapest layer.`,
    ...(hasSymptoms
      ? [
          `- Symptom kills count as kills: ${symptom.kills} confirmed, on ${symptom.killed} mutants, and ${symptom.unconfirmed} unconfirmed, on ${symptom.unconfirmedMutants} mutants. ${symptom.restingOnly} mutants rest only on symptom kills: their confirmed kills, or their unconfirmed kills when they have none, are all symptom kills. \`symptom_only\` marks them in the CSV, and in each group of the demand list and the e2e floor in the JSON.`,
        ]
      : []),
    ...(symptom.ignored.symptom_kills || symptom.ignored.symptom_unconfirmed_by
      ? [
          `- ${symptom.ignored.symptom_kills} ids in \`symptom_kills\` aren't in their mutant's \`killed_by\`, and ${symptom.ignored.symptom_unconfirmed_by} in \`symptom_unconfirmed_by\` aren't in its \`unconfirmed_by\`. They're ignored.`,
        ]
      : []),
    ...(unknownIds ? [`- ${unknownIds} test ids have no known layer.`] : []),
    `- The kills file records its own cheapest layer for ${recorded.compared} mutants, and it differs from the one derived here on ${recorded.differ.length}${recorded.differ.length ? `: ${recorded.differ.map((d) => d.mutant).join(", ")}` : ""}.`,
    `- The kills file's \`kill_confirmed\` and \`killed_at_layer\` give the cheapest layer for ${atLayer.compared} mutants. The other ${Object.keys(mutants).length - atLayer.compared} have no \`kill_confirmed\`, so their cheapest layer is recomputed from \`killed_by\`, \`typecheck\` and any failed contract checks.`,
    `- \`killed_at_layer\` disagrees with the recomputed layer on ${atLayer.differ.length} mutants, and \`killed_at_layer\` is used${atLayer.differ.length ? `: ${atLayer.differ.map((d) => `${d.mutant} (${d.killed_at_layer}, recomputed ${d.recomputed})`).join(", ")}` : ""}.`,
    "",
    "## Demand list",
    "",
    `Mutants with no confirmed killer at any layer: ${strataLine(derived.demand)}.`,
    ...(hasSymptoms ? [symptomLine(derived.demand)] : []),
    `${derived.demand_rows_with_an_unkilled_mutant} rows hold at least one of them, and ${derived.demand_rows_without_any_killer} rows have no killed mutant at all.`,
    `Routed by the kills file, as a judgement: ${Object.entries(routed)
      .map(([r, n]) => `${r} ${n}`)
      .join(", ")}.`,
    "",
    "| stratum | mutants | rows | rows with no killed mutant | unconfirmed e2e kill | only symptom kills | routed to |",
    "|---|---|---|---|---|---|---|",
    ...Object.entries(derived.demand).map(([s, g]) => {
      const routes = {};
      g.mutants.forEach((mid) => {
        const r = mutants[mid].routed_to ?? "not routed";
        routes[r] = (routes[r] ?? 0) + 1;
      });
      const bare = g.rows.filter(
        (id) => rowsById.get(id).status === "none killed",
      ).length;
      const unconfirmed = g.mutants.filter(
        (mid) => mutants[mid].unconfirmed_layer === "e2e",
      ).length;
      const routeText = Object.entries(routes)
        .map(([r, n]) => `${r} ${n}`)
        .join(", ");
      return `| ${s} | ${g.mutants.length} | ${g.rows.length} | ${bare} | ${unconfirmed} | ${g.symptom_only.length} | ${routeText} |`;
    }),
    "",
    "Each mutant, with its rows, e2e status and route, is in the CSV under `cheapest_killing_layer` none, and in the JSON under `demand`.",
    "",
    "## e2e floor",
    "",
    `Mutants whose cheapest confirmed layer is e2e: ${strataLine(derived.e2e_floor)}, in ${derived.e2e_floor_rows} rows.`,
    ...(hasSymptoms ? [symptomLine(derived.e2e_floor)] : []),
    `With unconfirmed e2e kills counted: ${strataLine(derived.e2e_floor_unconfirmed)}, in ${derived.e2e_floor_unconfirmed_rows} rows.`,
    ...(hasSymptoms ? [symptomLine(derived.e2e_floor_unconfirmed)] : []),
    `Routed to e2e by the kills file, a judgement and not a kill: ${strataLine(derived.e2e_floor_routed)}.`,
    "",
  ];
  return lines.join("\n");
}

function readSidecars(dir) {
  if (!dir) {
    return {};
  }
  const sidecars = {};
  const results = path.join(dir, "unit-results.json");
  const unitResults = fs.existsSync(results)
    ? JSON.parse(fs.readFileSync(results, "utf8"))
    : {};
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "unit-results.json") {
      continue;
    }
    const mid = name.replace(/\.json$/, "");
    const own = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    sidecars[mid] = { description: own.description };
  }
  for (const [mid, r] of Object.entries(unitResults)) {
    sidecars[mid] = { ...sidecars[mid], typecheck: r.typecheck };
  }
  return sidecars;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2), {
    booleans: ["allow-mixed"],
    multiple: ["candidates"],
  });
  const indexDir = args.index ?? process.env.JOURNEY_LOOKUP_INDEX;
  if (!indexDir || !args.kills || !args.out) {
    console.error(
      "Usage: node ledger.mjs --index <index dir> --kills <kills file> --kills-base <commit> --out <dir> " +
        "[--locations <reach-counts.jsonl>] [--candidates <file or test id> ...] [--mutants-dir <dir>] [--allow-mixed] [--repo <path>]",
    );
    process.exit(1);
  }
  if (!args["kills-base"]) {
    console.error(
      "The kills file doesn't record its base commit, so pass it with --kills-base <commit>.",
    );
    process.exit(1);
  }
  const index = loadIndex(indexDir);
  const ctx = { repo: args.repo ?? repoRoot(here), sha: index.meta.sha };
  const base = checkBase(ctx.repo, args["kills-base"], index.meta);
  if (base.status === "mixed" && !args["allow-mixed"]) {
    console.error(
      `Refusing to join: ${base.reason} (kills base ${base.kills_base}, index ${base.index_sha}, app commit ${base.index_app_base}). Pass --allow-mixed to join anyway with every row marked mixed.`,
    );
    process.exit(2);
  }
  const kills = JSON.parse(fs.readFileSync(args.kills, "utf8"));
  const reachCounts = args.locations
    ? fs
        .readFileSync(args.locations, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    : [];
  const candidates = args.candidates ? readCandidates(args.candidates) : [];
  const ledger = buildLedger({
    index,
    ctx,
    kills,
    base,
    reachCounts,
    candidates,
    sidecars: readSidecars(args["mutants-dir"]),
  });
  const derived = derive(ledger);
  const full = {
    ...ledger,
    inputs: {
      index: { runs: index.meta.runs.map((r) => r.runId), sha: index.meta.sha },
      kills: {
        mutants: Object.keys(kills).length,
        sha256: createHash("sha256")
          .update(fs.readFileSync(args.kills))
          .digest("hex"),
      },
      reach_counts: { lines: reachCounts.length },
      candidates,
    },
    ...derived,
  };
  const summary = summarize(ledger, derived, {
    kills: Object.keys(kills).length,
    reachCountsLines: reachCounts.length,
    candidates: candidates.length,
    runs: full.inputs.index.runs,
  });
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, "ledger.json"), JSON.stringify(full));
  fs.writeFileSync(path.join(args.out, "ledger.csv"), toCsv(ledger));
  fs.writeFileSync(path.join(args.out, "summary.md"), summary);
  console.log(summary);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
