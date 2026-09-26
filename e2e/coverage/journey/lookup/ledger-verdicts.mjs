// Recomputes each candidate's unique kills and verdict from a ledger, by kills.py's rules,
// and compares them with the JSON that kills.py --out wrote for the same kills file and index.
//   node ledger-verdicts.mjs --ledger <ledger.json> --verdicts <kills.py --out file> --candidates <file or test id> [--candidates ...]
//                            [--min-mutants <k>] [--require-strata <s,...>] [--strata coarse]
// With --strata coarse, each mutant's `stratum_coarse` stands in for its stratum, to compare with verdicts made before the strata retag.
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { parseArgs } from "./args.mjs";
import { readCandidates } from "./ledger.mjs";

const TEST_LAYERS = ["jest", "deftest", "e2e"];

const testIds = (groups) => TEST_LAYERS.flatMap((layer) => groups[layer] ?? []);

/**
 * Per mutant, the candidates in each field, and whether any other test is in it.
 * The ledger lists only the e2e ids that ran a mutant, so candidates must be e2e tests, which holds because unit tests are never candidates.
 */
function mutantView(m, position, reachedBy) {
  const split = (ids) => {
    const mine = new Set();
    let others = false;
    for (const id of ids) {
      if (position.has(id)) {
        mine.add(position.get(id));
      } else {
        others = true;
      }
    }
    return { mine, others };
  };
  const killed = split(testIds(m.killed_by));
  const unconfirmed = split(testIds(m.unconfirmed_by));
  const errored = split(testIds(m.errored));
  const ran = split(m.ran_e2e);
  const ranTotal = TEST_LAYERS.reduce((n, layer) => n + (m.ran[layer] ?? 0), 0);
  return {
    stratum: m.stratum,
    ran_known: m.ran_known,
    located: m.locations.length > 0,
    reached_by: reachedBy,
    killed_by: killed.mine,
    killed_by_others: killed.others,
    unconfirmed_by: unconfirmed.mine,
    unconfirmed_by_others: unconfirmed.others,
    errored: errored.mine,
    ran: ran.mine,
    ran_others: ranTotal > ran.mine.size,
    checker_kill: Boolean(
      m.killed_by.tsc?.length || m.killed_by.contract?.length,
    ),
  };
}

function coverKillers(m) {
  if (m.killed_by_others) {
    return new Set();
  }
  if (m.killed_by.size) {
    return m.killed_by;
  }
  if (m.unconfirmed_by_others) {
    return new Set();
  }
  return new Set(
    [...m.unconfirmed_by].filter((i) => !m.ran_known || m.ran.has(i)),
  );
}

/**
 * Greedy cover of the primary items: the most new primary items first, then the most new secondary items, then candidate order.
 * Afterwards, it drops chosen candidates whose primary items the other chosen candidates already keep.
 */
function killsFirstCover(primary, secondary) {
  const universe = new Set(primary.flatMap((p) => [...p]));
  const covered = new Set();
  const coveredSecondary = new Set();
  const chosen = [];
  const fresh = (set, seen) => [...set].filter((x) => !seen.has(x)).length;
  while (covered.size < universe.size) {
    let best = null;
    primary.forEach((p, i) => {
      const score = [fresh(p, covered), fresh(secondary[i], coveredSecondary)];
      if (
        score[0] > 0 &&
        (!best ||
          score[0] > best.score[0] ||
          (score[0] === best.score[0] && score[1] > best.score[1]))
      ) {
        best = { i, score };
      }
    });
    if (!best) {
      break;
    }
    chosen.push(best.i);
    primary[best.i].forEach((x) => covered.add(x));
    secondary[best.i].forEach((x) => coveredSecondary.add(x));
  }
  const counts = new Map();
  chosen.forEach((i) =>
    primary[i].forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1)),
  );
  const kept = [];
  for (const i of chosen) {
    if ([...primary[i]].every((x) => counts.get(x) > 1)) {
      primary[i].forEach((x) => counts.set(x, counts.get(x) - 1));
    } else {
      kept.push(i);
    }
  }
  return kept;
}

const sorted = (xs) => [...xs].sort();

function byStratumIds(mutants, mids) {
  const out = {};
  for (const mid of mids) {
    (out[mutants[mid].stratum] ??= []).push(mid);
  }
  return out;
}

export function verdictsFromLedger(
  ledger,
  candidateIds,
  minMutants,
  requiredStrata,
) {
  const position = new Map(candidateIds.map((id, i) => [id, i]));
  const state = new Map(ledger.tests.map((t) => [t.id, t.state]));
  const candidates = candidateIds.map((id, i) => ({
    i,
    id,
    state: state.has(id) ? state.get(id) : null,
  }));
  const rowReach = new Map(
    ledger.rows.map((row) => [
      row.id,
      [...row.reach_and_assert, ...row.reach_other]
        .map(([t]) => position.get(ledger.tests[t].id))
        .filter((i) => i !== undefined),
    ]),
  );
  const rowsReachedBy = candidates.map(() => new Set());
  for (const [rowId, reach] of rowReach) {
    reach.forEach((i) => rowsReachedBy[i].add(rowId));
  }

  const mutants = {};
  for (const [mid, m] of Object.entries(ledger.mutants)) {
    const reachedBy = new Set(m.rows.flatMap((id) => rowReach.get(id)));
    mutants[mid] = mutantView(m, position, reachedBy);
  }

  const fields = ["killed_by", "ran", "errored"];
  const by = Object.fromEntries(
    [...fields, "cover"].map((f) => [f, candidates.map(() => new Set())]),
  );
  for (const [mid, m] of Object.entries(mutants)) {
    fields.forEach((f) => m[f].forEach((i) => by[f][i].add(mid)));
    coverKillers(m).forEach((i) => by.cover[i].add(mid));
  }

  const primary = candidates.map(() => new Set());
  for (const [mid, m] of Object.entries(mutants)) {
    coverKillers(m).forEach((i) => {
      if (candidates[i].state === "passed") {
        primary[i].add(mid);
      }
    });
  }
  // The secondary items are the rows each candidate reaches.
  const coverKeeps = new Set(killsFirstCover(primary, rowsReachedBy));

  const results = {};
  const uniqueAlsoCheckerKilled = {};
  for (const t of candidates) {
    const cover = by.cover[t.i];
    const unconfirmedUnique = sorted(
      [...cover].filter(
        (mid) =>
          !mutants[mid].killed_by.size &&
          mutants[mid].unconfirmed_by.size === 1,
      ),
    );
    const coverKeptFor = coverKeeps.has(t.i) ? sorted(cover) : [];
    const mine = new Set([
      ...by.killed_by[t.i],
      ...by.ran[t.i],
      ...by.errored[t.i],
      ...cover,
    ]);
    if (mine.size === 0) {
      results[t.id] = {
        verdict: "unmeasured",
        reason: "not in the kill matrix",
      };
      continue;
    }
    const killsHere = [...by.killed_by[t.i]].filter(
      (mid) => !mutants[mid].ran_known || by.ran[t.i].has(mid),
    );
    const unique = sorted(
      killsHere.filter(
        (mid) =>
          mutants[mid].killed_by.size === 1 && !mutants[mid].killed_by_others,
      ),
    );
    const withChecker = unique.filter((mid) => mutants[mid].checker_kill);
    if (withChecker.length) {
      uniqueAlsoCheckerKilled[t.id] = withChecker;
    }
    const qualifying = [...by.ran[t.i]].filter((mid) => {
      const m = mutants[mid];
      return (
        !by.errored[t.i].has(mid) &&
        (m.ran.size > 1 || m.ran_others) &&
        (!m.located || m.reached_by.has(t.i))
      );
    });
    const strata = {};
    qualifying.forEach((mid) => {
      const s = mutants[mid].stratum;
      strata[s] = (strata[s] ?? 0) + 1;
    });
    const withoutLocation = {};
    qualifying
      .filter((mid) => !mutants[mid].located)
      .forEach((mid) => {
        const s = mutants[mid].stratum;
        withoutLocation[s] = (withoutLocation[s] ?? 0) + 1;
      });
    const detail = {
      unique_kills: byStratumIds(ledger.mutants, unique),
      unconfirmed_unique_kills: byStratumIds(ledger.mutants, unconfirmedUnique),
      cover_kept_for: byStratumIds(ledger.mutants, coverKeptFor),
      kills: killsHere.length,
      misses: [...by.ran[t.i]].filter(
        (mid) => !by.killed_by[t.i].has(mid) && !by.errored[t.i].has(mid),
      ).length,
      errored: sorted(by.errored[t.i]),
      qualifying_mutants: strata,
      qualifying_without_location: withoutLocation,
    };
    const missing = requiredStrata.filter((s) => !strata[s]);
    let verdict;
    let reason;
    if (unique.length) {
      [verdict, reason] = ["keep", "unique kills"];
    } else if (coverKeptFor.some((mid) => mutants[mid].killed_by.size)) {
      [verdict, reason] = [
        "keep",
        "the kills-first cover keeps it for kills it shares only with other candidates",
      ];
    } else if (unconfirmedUnique.length) {
      [verdict, reason] = ["provisional-keep", "unconfirmed unique kills"];
    } else if (coverKeptFor.length) {
      [verdict, reason] = [
        "provisional-keep",
        "the kills-first cover keeps it for unconfirmed kills it shares only with other candidates",
      ];
    } else if (t.state == null) {
      [verdict, reason] = [
        "unmeasured",
        "not in the capture run, so its reached code is unknown",
      ];
    } else if (t.state !== "passed") {
      [verdict, reason] = [
        "unmeasured",
        `${t.state} in the capture run, so its reached code is incomplete`,
      ];
    } else if (![...mine].every((mid) => mutants[mid].ran_known)) {
      [verdict, reason] = ["unmeasured", "ran unknown"];
    } else if (qualifying.length < minMutants) {
      [verdict, reason] = [
        "unmeasured",
        `${qualifying.length} qualifying mutants, fewer than ${minMutants}`,
      ];
    } else if (missing.length) {
      [verdict, reason] = [
        "unmeasured",
        `no qualifying ${missing.join(", ")} mutant`,
      ];
    } else {
      [verdict, reason] = ["delete", "no unique kill"];
    }
    results[t.id] = { verdict, reason, ...detail };
  }

  const candidatesReaching = Object.fromEntries(
    Object.entries(mutants).map(([mid, m]) => [mid, m.reached_by.size]),
  );
  return {
    results,
    states: Object.fromEntries(candidates.map((t) => [t.id, t.state])),
    coverKept: sorted([...coverKeeps].map((i) => candidates[i].id)),
    candidatesReaching,
    uniqueAlsoCheckerKilled,
  };
}

// kills.py builds the strata keys from a Python set, so their order isn't fixed and is ignored here.
function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, normalize(value[k])]),
    );
  }
  return value;
}

function main() {
  const args = parseArgs(process.argv.slice(2), { multiple: ["candidates"] });
  if (!args.ledger || !args.verdicts || !args.candidates) {
    console.error(
      "Usage: node ledger-verdicts.mjs --ledger <ledger.json> --verdicts <kills.py --out file> --candidates <file or test id> [--candidates ...] [--min-mutants <k>] [--require-strata <s,...>] [--strata coarse]",
    );
    process.exit(1);
  }
  const ledger = JSON.parse(fs.readFileSync(args.ledger, "utf8"));
  if (args.strata === "coarse") {
    for (const m of Object.values(ledger.mutants)) {
      m.stratum = m.stratum_coarse ?? m.stratum;
    }
  }
  const expected = JSON.parse(fs.readFileSync(args.verdicts, "utf8"));
  const candidateIds = readCandidates(args.candidates);
  const minMutants = Number(args["min-mutants"] ?? expected.min_mutants ?? 5);
  const requiredStrata = (
    args["require-strata"] ??
    (expected.required_strata ?? ["logic", "wiring"]).join(",")
  )
    .split(",")
    .filter(Boolean);
  const got = verdictsFromLedger(
    ledger,
    candidateIds,
    minMutants,
    requiredStrata,
  );

  const differences = [];
  const expectedIds = Object.keys(expected.candidates);
  const missing = expectedIds.filter((id) => !(id in got.results));
  const extra = Object.keys(got.results).filter(
    (id) => !(id in expected.candidates),
  );
  if (missing.length || extra.length) {
    differences.push(
      `candidate sets differ: ${missing.length} only in the verdicts file, ${extra.length} only here`,
    );
  }
  for (const id of expectedIds.filter((x) => x in got.results)) {
    const { state, ...want } = expected.candidates[id];
    const have = got.results[id];
    if (state !== got.states[id]) {
      differences.push(
        `${id}: state ${state} in the verdicts file, ${got.states[id]} here`,
      );
    }
    for (const field of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (!isDeepStrictEqual(normalize(want[field]), normalize(have[field]))) {
        differences.push(
          `${id}: ${field} ${JSON.stringify(want[field])} in the verdicts file, ${JSON.stringify(have[field])} here`,
        );
      }
    }
  }
  if (!isDeepStrictEqual(sorted(expected.kills_cover.kept), got.coverKept)) {
    differences.push(
      `kills-first cover keeps ${JSON.stringify(expected.kills_cover.kept)} in the verdicts file, ${JSON.stringify(got.coverKept)} here`,
    );
  }
  let reachDiffs = 0;
  for (const [mid, m] of Object.entries(expected.mutants)) {
    if (m.candidates_reaching !== got.candidatesReaching[mid]) {
      reachDiffs += 1;
      differences.push(
        `${mid}: ${m.candidates_reaching} candidates reach it in the verdicts file, ${got.candidatesReaching[mid]} here`,
      );
    }
  }

  const tally = (results) => {
    const out = {};
    Object.values(results).forEach(
      (r) => (out[r.verdict] = (out[r.verdict] ?? 0) + 1),
    );
    return out;
  };
  const uniqueSets = (results, field) =>
    Object.entries(results)
      .filter(([, r]) => Object.keys(r[field] ?? {}).length)
      .map(([id, r]) => `${id} ${JSON.stringify(normalize(r[field]))}`);
  console.log(
    `Verdicts from the ledger: ${JSON.stringify(tally(got.results))}`,
  );
  console.log(
    `Verdicts in the verdicts file: ${JSON.stringify(tally(expected.candidates))}`,
  );
  console.log(
    `Unique kills from the ledger: ${uniqueSets(got.results, "unique_kills").join("; ") || "none"}`,
  );
  console.log(
    `Unconfirmed unique kills from the ledger: ${uniqueSets(got.results, "unconfirmed_unique_kills").join("; ") || "none"}`,
  );
  console.log(
    `Candidates reaching each mutant: ${Object.keys(expected.mutants).length - reachDiffs} of ${Object.keys(expected.mutants).length} mutants agree`,
  );
  const checker = Object.entries(got.uniqueAlsoCheckerKilled);
  console.log(
    `Unique kills of mutants the type checker also kills: ${checker.length ? checker.map(([id, mids]) => `${id} ${mids.join(", ")}`).join("; ") : "none"}`,
  );
  if (differences.length) {
    console.log(`\n${differences.length} differences:`);
    differences.forEach((d) => console.log(`  ${d}`));
    process.exit(1);
  }
  console.log(
    `\nNo differences across ${expectedIds.length} candidates and ${Object.keys(expected.mutants).length} mutants.`,
  );
}

main();
