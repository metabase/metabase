/**
 * Classifies each mutant from the per-test results of the fast pass (all
 * mutants in one jest run) and the confirmation pass (the failing pairs again,
 * one module registry per mutant).
 *
 * A mutant is caught only by a test that passes on clean code, fails because
 * its own code noticed the mutant when it is on, and does both again in the
 * confirmation pass. A failure raised inside product code, and a timeout, are
 * unmeasured.
 */

import { type TestResult, mutantOf, stripMutant } from "./jest";

export type Outcome = "passed" | "failed" | "other";

export interface Observation {
  outcome: Outcome;
  /**
   * The test's own code noticed the mutant: an assertion failed, or the test
   * crashed on the value the mutant produced.
   */
  observed: boolean;
  /** Why a failure was not an observation, for the unmeasured detail. */
  note?: string;
}

/** testName -> mutantId -> observation; mutant 0 is the clean run. */
export type PassResults = Map<string, Map<number, Observation>>;

export type MutantVerdict =
  | { status: "caught"; by: string[] }
  | { status: "survived"; ranBy: number }
  | { status: "unmeasured"; reason: string };

const ASSERTION_RE =
  /expect\(|Expected|Received|toHave|toBe|toEqual|toMatch|toContain|Unable to find|TestingLibraryElementError|AssertionError|toThrow|Found multiple elements/;

/**
 * Jest's own timeout, which races Testing Library's async timeout and says
 * nothing about whether a test noticed the mutant.
 */
const TIMEOUT_RE = /Exceeded timeout of|Async callback was not invoked/;

/** The deepest frame of a stack, which is where the failure was raised. */
const TOP_FRAME_RE = /^\s+at (?:[^\n(]*\()?([^\s()]+?):\d+:\d+\)?\s*$/m;

const SPEC_FILE_RE = /\.spec\.[jt]sx?$/;

export function classifyFailure(messages: string[]): Observation {
  const text = messages.join("\n");
  if (TIMEOUT_RE.test(text)) {
    return { outcome: "failed", observed: false, note: "timed out" };
  }
  if (ASSERTION_RE.test(text)) {
    return { outcome: "failed", observed: true };
  }
  // A throw whose deepest frame is the spec is the test crashing on what the
  // mutant handed it, such as reading a property of a now-undefined return
  // value. A throw from product code is the module breaking instead, which no
  // assertion noticed.
  const frame = text.match(TOP_FRAME_RE);
  if (frame && SPEC_FILE_RE.test(frame[1])) {
    return { outcome: "failed", observed: true };
  }
  return {
    outcome: "failed",
    observed: false,
    note: "error in product code, not an assertion",
  };
}

export function judgeMutant(
  mutantId: number,
  fast: PassResults,
  confirm: PassResults | null,
): MutantVerdict {
  const caughtBy: string[] = [];
  const reasons: string[] = [];
  let ranBy = 0;
  for (const [test, byMutant] of fast) {
    const clean = byMutant.get(0);
    const broken = byMutant.get(mutantId);
    if (!broken || clean?.outcome !== "passed") {
      continue;
    }
    ranBy++;
    if (broken.outcome === "passed") {
      continue;
    }
    if (broken.outcome !== "failed" || !broken.observed) {
      reasons.push(
        `${test}: ${
          broken.outcome === "failed"
            ? (broken.note ?? "not an observation")
            : "did not finish"
        }`,
      );
      continue;
    }
    if (!confirm) {
      caughtBy.push(test);
      continue;
    }
    const confirmed = confirm.get(test);
    const confirmedClean = confirmed?.get(0);
    const confirmedBroken = confirmed?.get(mutantId);
    if (
      !confirmedBroken ||
      !confirmedClean ||
      confirmedClean.outcome === "other"
    ) {
      reasons.push(`${test}: not rerun`);
    } else if (confirmedClean.outcome !== "passed") {
      reasons.push(`${test}: fails on a clean rerun`);
    } else if (
      confirmedBroken.outcome === "failed" &&
      confirmedBroken.observed
    ) {
      caughtBy.push(test);
    } else {
      reasons.push(`${test}: not reproduced on rerun`);
    }
  }
  if (caughtBy.length > 0) {
    return { status: "caught", by: caughtBy };
  }
  if (reasons.length > 0) {
    return { status: "unmeasured", reason: reasons.join("; ") };
  }
  if (ranBy === 0) {
    return { status: "unmeasured", reason: "no test ran it on clean code" };
  }
  return { status: "survived", ranBy };
}

export interface CollectedPass {
  pass: PassResults;
  /** Test name (without the mutant prefix) to its it() title, for jest's -t filter. */
  titles: Map<string, string>;
  /** Test name to the unit specs whose wrapper ran it. */
  specs: Map<string, Set<string>>;
}

export function collectPass(
  results: TestResult[],
  wrapperSpecs: Map<string, string>,
): CollectedPass {
  const pass: PassResults = new Map();
  const titles = new Map<string, string>();
  const specs = new Map<string, Set<string>>();
  for (const result of results) {
    const mutant = mutantOf(result.title);
    if (mutant === null) {
      continue;
    }
    const name = stripMutant(result.fullName);
    titles.set(name, stripMutant(result.title));
    const spec = wrapperSpecs.get(result.file);
    if (spec) {
      const seen = specs.get(name) ?? new Set<string>();
      seen.add(spec);
      specs.set(name, seen);
    }
    let observation: Observation;
    if (result.status === "passed") {
      observation = { outcome: "passed", observed: false };
    } else if (result.status === "failed") {
      observation = classifyFailure(result.failureMessages);
    } else {
      observation = { outcome: "other", observed: false };
    }
    let byMutant = pass.get(name);
    if (!byMutant) {
      byMutant = new Map();
      pass.set(name, byMutant);
    }
    byMutant.set(mutant, observation);
  }
  return { pass, titles, specs };
}

/**
 * The (spec, mutant) pairs the confirmation pass has to rerun, keyed by spec.
 * Only the spec that saw a mutant fail can confirm it, so a pair per spec is
 * what the rerun needs. One wrapper file per mutant for every spec in the run
 * is quadratic, and over a few hundred mutants it exceeds the system limit on
 * the length of a command line.
 */
export function failingPairs({ pass, titles, specs }: CollectedPass) {
  const pairs = new Map<string, Set<number>>();
  const failingTitles = new Set<string>();
  for (const [name, byMutant] of pass) {
    if (byMutant.get(0)?.outcome !== "passed") {
      continue;
    }
    for (const [mutant, observation] of byMutant) {
      if (
        mutant === 0 ||
        observation.outcome !== "failed" ||
        !observation.observed
      ) {
        continue;
      }
      for (const spec of specs.get(name) ?? []) {
        const mutants = pairs.get(spec) ?? new Set<number>();
        mutants.add(mutant);
        pairs.set(spec, mutants);
      }
      failingTitles.add(titles.get(name) ?? name);
    }
  }
  return { pairs, titles: [...failingTitles] };
}
