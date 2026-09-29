// Recomputes each candidate's unique kills and verdict from a ledger, by kills.py's rules,
// and compares them with the JSON that kills.py --out wrote for the same kills file and index.
//   node ledger-verdicts.mjs --ledger <ledger.json> --verdicts <kills.py --out file> --candidates <file or test id> [--candidates ...]
//                            [--min-mutants <k>] [--require-strata <s,...>] [--strata coarse]
// With --strata coarse, each mutant's `stratum_coarse` stands in for its stratum, to compare with verdicts made before the strata retag.
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { parseArgs } from "./args.mjs";
import { TEST_STATES, readCandidates } from "./ledger.mjs";

const TEST_LAYERS = ["jest", "deftest", "e2e"];
const KEPT = ["keep", "provisional-keep"];
const SYMPTOM_ONLY = "all symptom kills";
const NO_CREDIT = ["unresolved", "reviewed equivalence", "scope decision"];
const COARSE_STRATA = {
  logic: "logic",
  "intra-frontend-wiring": "wiring",
  "boundary-wiring": "wiring",
  "browser-measurement": "wiring",
  "store-state": "state",
  "server-state": "state",
  "cross-page-timing": "state",
};

const coarseStratum = (m) =>
  m.stratum_coarse ?? COARSE_STRATA[m.stratum] ?? m.stratum;

// An older ledger holds its measured reach in `reach_and_assert` and `reach_other`.
const REACH_FIELDS = {
  subtraction: [
    "reach_and_assert_measured",
    "reach_other_measured",
    "reach_and_assert",
    "reach_other",
  ],
  baseline: ["reach_and_assert_baseline", "reach_other_baseline"],
};

const testIds = (groups) => TEST_LAYERS.flatMap((layer) => groups[layer] ?? []);

/**
 * What the remaining tests and checkers did on the mutant, as kills.py's remaining_side() gives it: a result, the scope and the result in words.
 * The ledger counts every test's state by layer and keeps each e2e test's state, so leaving out the candidates, which are e2e tests, gives the rest.
 */
function remainingSide(m, position) {
  const counts = Object.fromEntries(TEST_STATES.map((s) => [s, 0]));
  for (const layerCounts of Object.values(m.test_states ?? {})) {
    for (const [s, n] of Object.entries(layerCounts)) {
      counts[s] += n;
    }
  }
  for (const [id, s] of Object.entries(m.e2e_states ?? {})) {
    if (position.has(id)) {
      counts[s] -= 1;
    }
  }
  const killed =
    counts.killed + counts["symptom kill"] + (m.checker_kills ?? []).length;
  const unconfirmed = counts.unconfirmed + counts["unconfirmed symptom kill"];
  const excluded = (m.excluded ?? []).filter((x) => !position.has(x.test));
  const scope = m.scope ?? "full";
  let result;
  if (killed) {
    result = "killed";
  } else if (counts.missed) {
    result = "missed";
  } else if (counts.errored || unconfirmed) {
    result = "unresolved";
  } else if (excluded.length) {
    result = "statically excluded";
  } else {
    result = "unmeasured at the head";
  }
  const tail = [
    [counts.errored, "errored"],
    [unconfirmed, "unconfirmed"],
    [counts["not run"], "selected but not run"],
    [result === "statically excluded" ? 0 : excluded.length, "excluded"],
  ]
    .filter(([n]) => n)
    .map(([n, what]) => `${n} ${what}`);
  const selected = scope === "selected" ? "selected " : "";
  const reasons = [
    ...new Set(
      excluded.map((x) =>
        x.reason == null ? "no reason given" : String(x.reason),
      ),
    ),
  ].sort();
  const text = {
    killed: `killed by ${killed} ${selected}remaining tests`,
    missed: `missed by ${counts.missed} ${selected}remaining tests`,
    unresolved: `no result from the ${selected}remaining tests`,
    "statically excluded": `statically excluded: ${reasons.join("; ")}`,
    "unmeasured at the head": "not run by any remaining test",
  }[result];
  return { result, scope, text: [text, ...tail].join(", ") };
}

/**
 * The widest scope at which the remaining side missed any of the mutants, and the remaining side's result on each when it isn't full,
 * as kills.py's reading_scope() gives them.
 */
function readingScope(mids, mutants) {
  if (mids.length === 0) {
    return [null, null];
  }
  const missed = new Set(
    mids
      .filter((mid) => mutants[mid].remaining.result === "missed")
      .map((mid) => mutants[mid].remaining.scope),
  );
  const scope = missed.has("full")
    ? "full"
    : missed.size
      ? "selected"
      : "unmeasured";
  if (scope === "full") {
    return [scope, null];
  }
  const byText = new Map();
  for (const mid of mids) {
    const text = mutants[mid].remaining.text;
    byText.set(text, [...(byText.get(text) ?? []), mid]);
  }
  const groups = [...byText.entries()].sort(([, a], [, b]) =>
    a[0] < b[0] ? -1 : 1,
  );
  return [
    scope,
    groups.map(([text, ids]) => `${ids.join(", ")}: ${text}`).join("; "),
  ];
}

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
  const symptomIds = new Set(testIds(m.symptom_kills ?? {}));
  // The checkers run on every PR, so a checker kill is a kill by the remaining suite.
  const checkers = m.checker_kills ?? [];
  const ranTotal = TEST_LAYERS.reduce((n, layer) => n + (m.ran[layer] ?? 0), 0);
  return {
    stratum: m.stratum,
    coarse: coarseStratum(m),
    ran_known: m.ran_known,
    located: m.locations.length > 0,
    reached_by: reachedBy,
    killed_by: killed.mine,
    killed_by_others: killed.others || checkers.length > 0,
    unconfirmed_by: unconfirmed.mine,
    unconfirmed_by_others: unconfirmed.others,
    errored: errored.mine,
    ran: ran.mine,
    ran_others: ranTotal > ran.mine.size || checkers.length > 0,
    symptom_kills: split(symptomIds).mine,
    symptom_unconfirmed_by: split(testIds(m.symptom_unconfirmed_by ?? {})).mine,
    others_kill_only_by_symptom:
      checkers.length === 0 &&
      testIds(m.killed_by)
        .filter((id) => !position.has(id))
        .every((id) => symptomIds.has(id)),
    checker_kills: checkers,
    checker_kill: Boolean(
      m.killed_by.tsc?.length || m.killed_by.contract?.length,
    ),
    remaining: remainingSide(m, position),
    suspect: m.equivalence_state ?? null,
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
 * Greedy cover of the primary items: the most new primary items first, then the most new of them outside the candidate's `symptom` items,
 * then the most new secondary items, then candidate order.
 * Afterwards, it drops chosen candidates whose primary items the other chosen candidates already keep,
 * those with the most `symptom` items first.
 */
function killsFirstCover(primary, secondary, symptom) {
  const universe = new Set(primary.flatMap((p) => [...p]));
  const assertion = primary.map(
    (p, i) => new Set([...p].filter((x) => !symptom[i].has(x))),
  );
  const covered = new Set();
  const coveredSecondary = new Set();
  const chosen = [];
  const fresh = (set, seen) => [...set].filter((x) => !seen.has(x)).length;
  const better = (a, b) => {
    const k = a.findIndex((x, j) => x !== b[j]);
    return k !== -1 && a[k] > b[k];
  };
  while (covered.size < universe.size) {
    let best = null;
    primary.forEach((p, i) => {
      const score = [
        fresh(p, covered),
        fresh(assertion[i], covered),
        fresh(secondary[i], coveredSecondary),
      ];
      if (score[0] > 0 && (!best || better(score, best.score))) {
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
  const order = [...chosen].sort((a, b) => symptom[b].size - symptom[a].size);
  for (const i of order) {
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

function checkerIds(ledgerMutants, view, mids) {
  return Object.fromEntries(
    Object.entries(byStratumIds(ledgerMutants, mids)).map(([s, ids]) => [
      s,
      Object.fromEntries(ids.map((mid) => [mid, view[mid].checker_kills])),
    ]),
  );
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
    ledger.rows.map((row) => {
      const bases = new Map();
      for (const [basis, fields] of Object.entries(REACH_FIELDS)) {
        for (const [t] of fields.flatMap((f) => row[f] ?? [])) {
          const i = position.get(ledger.tests[t].id);
          if (i !== undefined) {
            bases.set(i, (bases.get(i) ?? new Set()).add(basis));
          }
        }
      }
      return [row.id, bases];
    }),
  );

  const mutants = {};
  for (const [mid, m] of Object.entries(ledger.mutants)) {
    const reachedBy = new Map();
    for (const rowId of m.rows) {
      rowReach.get(rowId).forEach((bases, i) => {
        reachedBy.set(i, new Set([...(reachedBy.get(i) ?? []), ...bases]));
      });
    }
    mutants[mid] = mutantView(m, position, reachedBy);
  }

  const fields = [
    "killed_by",
    "ran",
    "errored",
    "unconfirmed_by",
    "symptom_kills",
    "symptom_unconfirmed_by",
  ];
  const by = Object.fromEntries(
    [...fields, "cover"].map((f) => [f, candidates.map(() => new Set())]),
  );
  for (const [mid, m] of Object.entries(mutants)) {
    fields.forEach((f) => m[f].forEach((i) => by[f][i].add(mid)));
    coverKillers(m).forEach((i) => by.cover[i].add(mid));
  }

  const primary = candidates.map(() => new Set());
  const symptom = candidates.map(() => new Set());
  for (const [mid, m] of Object.entries(mutants)) {
    const marked = m.killed_by.size
      ? m.symptom_kills
      : m.symptom_unconfirmed_by;
    coverKillers(m).forEach((i) => {
      if (candidates[i].state === "passed") {
        primary[i].add(mid);
        if (marked.has(i)) {
          symptom[i].add(mid);
        }
      }
    });
  }
  // The secondary items are the index keys each candidate reached.
  const coverKeeps = new Set(
    killsFirstCover(
      primary,
      candidates.map((t) => new Set(ledger.candidate_keys?.[t.id] ?? [])),
      symptom,
    ),
  );

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
    const suspects = [];
    const qualifying = [...by.ran[t.i]].filter((mid) => {
      const m = mutants[mid];
      const sampled =
        !by.errored[t.i].has(mid) &&
        (m.ran.size > 1 || m.ran_others) &&
        (!m.located || m.reached_by.has(t.i));
      if (sampled && NO_CREDIT.includes(m.suspect)) {
        suspects.push(mid);
        return false;
      }
      return sampled;
    });
    const qualifyingBasis = {};
    for (const mid of qualifying) {
      for (const basis of mutants[mid].located
        ? mutants[mid].reached_by.get(t.i)
        : []) {
        (qualifyingBasis[basis] ??= []).push(mid);
      }
    }
    const ranHere = (mid) => !mutants[mid].ran_known || by.ran[t.i].has(mid);
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
      symptom_kills: byStratumIds(
        ledger.mutants,
        sorted(killsHere.filter((mid) => by.symptom_kills[t.i].has(mid))),
      ),
      unconfirmed_symptom_kills: byStratumIds(
        ledger.mutants,
        sorted([...by.symptom_unconfirmed_by[t.i]].filter(ranHere)),
      ),
      also_killed_by_checker: checkerIds(
        ledger.mutants,
        mutants,
        sorted(killsHere.filter((mid) => mutants[mid].checker_kills.length)),
      ),
      kills: killsHere.length,
      misses: [...by.ran[t.i]].filter(
        (mid) =>
          !by.killed_by[t.i].has(mid) &&
          !by.errored[t.i].has(mid) &&
          !by.unconfirmed_by[t.i].has(mid),
      ).length,
      errored: sorted(by.errored[t.i]),
      qualifying_mutants: strata,
      qualifying_without_location: withoutLocation,
      qualifying_basis: Object.fromEntries(
        Object.entries(qualifyingBasis).map(([basis, mids]) => [
          basis,
          sorted(mids),
        ]),
      ),
      equivalent_suspects: Object.fromEntries(
        sorted(suspects).map((mid) => [mid, mutants[mid].suspect]),
      ),
    };
    const coarse = new Set(qualifying.map((mid) => mutants[mid].coarse));
    const missing = requiredStrata.filter((s) => !coarse.has(s));
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
    } else if (
      !qualifying.some((mid) => by.killed_by[t.i].has(mid)) &&
      ![...by.ran[t.i]].some(
        (mid) =>
          !by.errored[t.i].has(mid) && mutants[mid].coarse === "baseline",
      )
    ) {
      [verdict, reason] = ["unmeasured", "needs a baseline check"];
    } else {
      [verdict, reason] = ["delete", "no unique kill"];
    }
    let grounds = [];
    if (verdict === "keep") {
      grounds = [
        ...new Set([
          ...unique,
          ...coverKeptFor.filter((mid) => mutants[mid].killed_by.size),
        ]),
      ];
    } else if (verdict === "provisional-keep") {
      grounds = [...new Set([...unconfirmedUnique, ...coverKeptFor])];
    }
    const symptomKill = (mid) =>
      (mutants[mid].killed_by.size
        ? mutants[mid].symptom_kills
        : mutants[mid].symptom_unconfirmed_by
      ).has(t.i);
    const symptomOnly = grounds.length > 0 && grounds.every(symptomKill);
    if (symptomOnly) {
      reason = `${reason}, ${SYMPTOM_ONLY}`;
    }
    const [scope, scopeText] = readingScope(sorted(grounds), mutants);
    if (scopeText) {
      reason = `${reason}; ${scopeText}`;
    }
    results[t.id] = {
      verdict,
      reason,
      scope,
      ...detail,
      symptom_only: symptomOnly,
    };
  }

  const kept = new Set(
    candidates
      .filter((t) => KEPT.includes(results[t.id].verdict))
      .map((t) => t.i),
  );
  for (const t of candidates) {
    if (kept.has(t.i)) {
      continue;
    }
    const afterDeletion = [...by.killed_by[t.i]].filter((mid) => {
      const m = mutants[mid];
      const staying = [...m.killed_by].filter((i) => kept.has(i));
      return (
        (m.killed_by_others || staying.length > 0) &&
        m.others_kill_only_by_symptom &&
        staying.every((i) => m.symptom_kills.has(i))
      );
    });
    results[t.id].symptom_only_after_deletion = byStratumIds(
      ledger.mutants,
      sorted(afterDeletion),
    );
    const lost = [...by.killed_by[t.i]].filter(
      (mid) =>
        !mutants[mid].killed_by_others &&
        ![...mutants[mid].killed_by].some((i) => kept.has(i)),
    );
    results[t.id].scope = readingScope(sorted(lost), mutants)[0];
  }

  const candidatesReaching = Object.fromEntries(
    Object.entries(mutants).map(([mid, m]) => [mid, m.reached_by.size]),
  );
  return {
    results,
    withoutKeys: candidates
      .filter((t) => t.state != null && !ledger.candidate_keys?.[t.id])
      .map((t) => t.id),
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
  if (got.withoutKeys.length) {
    differences.push(
      `${got.withoutKeys.length} candidates in the index have no reached keys in the ledger, so the kills-first cover can't break ties as kills.py does. Pass the same --candidates to ledger.mjs`,
    );
  }
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
    // `acceptance` comes from the location prior, which the ledger doesn't take.
    delete want.acceptance;
    // `depends_on` comes from the verdicts of the other candidates, which are compared on their own rows.
    delete want.depends_on;
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
  const symptomOnly = Object.entries(got.results)
    .filter(([, r]) => r.symptom_only)
    .map(([id, r]) => `${id} (${r.verdict})`);
  console.log(
    `Keeps and provisional-keeps that rest only on symptom kills, from the ledger: ${symptomOnly.join("; ") || "none"}`,
  );
  console.log(
    `Symptom kills from the ledger: ${uniqueSets(got.results, "symptom_kills").join("; ") || "none"}`,
  );
  console.log(
    `Unconfirmed symptom kills from the ledger: ${uniqueSets(got.results, "unconfirmed_symptom_kills").join("; ") || "none"}`,
  );
  console.log(
    `Candidates reaching each mutant: ${Object.keys(expected.mutants).length - reachDiffs} of ${Object.keys(expected.mutants).length} mutants agree`,
  );
  const checker = Object.entries(got.uniqueAlsoCheckerKilled);
  console.log(
    `Unique kills of mutants the type checker or the contract checker also kills: ${checker.length ? checker.map(([id, mids]) => `${id} ${mids.join(", ")}`).join("; ") : "none"}`,
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
