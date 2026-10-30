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

/** One wrapper file's observation of one mutant. */
export interface Witness {
  observation: Observation;
  /** The wrapper file, which is the module registry the mutant ran in. */
  file: string;
  /** The unit spec that wrapper was generated from. */
  spec: string;
}

export interface TestRun {
  /** mutantId -> every wrapper file that ran it. */
  byMutant: Map<number, Witness[]>;
  /** Wrapper file -> that file's clean run of this test. */
  clean: Map<string, Observation>;
}

/**
 * testName -> its runs.
 *
 * Each spec gets one wrapper file per `--wrappers`, and every one of them runs
 * that spec's clean variant. A single clean observation per test is therefore
 * the one from whichever file jest finished last, and one unstable clean run
 * voids every other file's verdicts. Keeping the clean run per file pairs a
 * mutant with the clean run of its own module registry.
 */
export type PassResults = Map<string, TestRun>;

export type MutantVerdict =
  | { status: "caught"; by: string[] }
  | { status: "survived"; ranBy: number }
  | {
      status: "unmeasured";
      reason: string;
      /** Tests whose failed clean rerun is why this mutant has no verdict. */
      cleanRerunTests?: string[];
    };

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

/**
 * A test that passed on clean code in the fast pass but not in the
 * confirmation pass. It cannot confirm anything, so it voids every mutant it
 * was the only witness for.
 */
export const CLEAN_RERUN_NOTE = "fails on a clean rerun";

/**
 * No test that passes on clean code ran this mutant. Without a timeout that
 * means the mutant's own file was never reached; with one it usually means the
 * pass was killed before its wrapper ran.
 */
export const NO_CLEAN_RUN_NOTE = "no test ran it on clean code";

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

type ConfirmOutcome =
  | "killed"
  | "clean failed"
  | "not reproduced"
  | "not rerun";

/**
 * What the confirmation pass made of one mutant for one test. A witness counts
 * only against the clean run of its own wrapper file.
 */
function confirmOutcome(
  run: TestRun | undefined,
  mutantId: number,
): ConfirmOutcome {
  let outcome: ConfirmOutcome = "not rerun";
  for (const witness of run?.byMutant.get(mutantId) ?? []) {
    const clean = run?.clean.get(witness.file);
    if (!clean || clean.outcome === "other") {
      continue;
    }
    if (clean.outcome !== "passed") {
      if (outcome === "not rerun") {
        outcome = "clean failed";
      }
      continue;
    }
    const broken = witness.observation;
    if (broken.outcome === "failed" && broken.observed) {
      return "killed";
    }
    outcome = "not reproduced";
  }
  return outcome;
}

export function judgeMutant(
  mutantId: number,
  fast: PassResults,
  confirm: PassResults | null,
): MutantVerdict {
  const caughtBy = new Set<string>();
  const reasons: string[] = [];
  const cleanRerunTests: string[] = [];
  let ranBy = 0;
  for (const [test, run] of fast) {
    for (const witness of run.byMutant.get(mutantId) ?? []) {
      if (run.clean.get(witness.file)?.outcome !== "passed") {
        continue;
      }
      ranBy++;
      const broken = witness.observation;
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
        caughtBy.add(test);
        continue;
      }
      const outcome = confirmOutcome(confirm.get(test), mutantId);
      if (outcome === "killed") {
        caughtBy.add(test);
      } else if (outcome === "clean failed") {
        reasons.push(`${test}: ${CLEAN_RERUN_NOTE}`);
        cleanRerunTests.push(test);
      } else if (outcome === "not reproduced") {
        reasons.push(`${test}: not reproduced on rerun`);
      } else {
        reasons.push(`${test}: not rerun`);
      }
    }
  }
  if (caughtBy.size > 0) {
    return { status: "caught", by: [...caughtBy] };
  }
  if (reasons.length > 0) {
    return {
      status: "unmeasured",
      reason: reasons.join("; "),
      ...(cleanRerunTests.length > 0 && { cleanRerunTests }),
    };
  }
  if (ranBy === 0) {
    return { status: "unmeasured", reason: NO_CLEAN_RUN_NOTE };
  }
  return { status: "survived", ranBy };
}

export interface CollectedPass {
  pass: PassResults;
  /** Test name (without the mutant prefix) to its it() title, for jest's -t filter. */
  titles: Map<string, string>;
}

export function collectPass(
  results: TestResult[],
  wrapperSpecs: Map<string, string>,
): CollectedPass {
  const pass: PassResults = new Map();
  const titles = new Map<string, string>();
  for (const result of results) {
    const mutant = mutantOf(result.title);
    if (mutant === null) {
      continue;
    }
    const name = stripMutant(result.fullName);
    titles.set(name, stripMutant(result.title));
    let observation: Observation;
    if (result.status === "passed") {
      observation = { outcome: "passed", observed: false };
    } else if (result.status === "failed") {
      observation = classifyFailure(result.failureMessages);
    } else {
      observation = { outcome: "other", observed: false };
    }
    let run = pass.get(name);
    if (!run) {
      run = { byMutant: new Map(), clean: new Map() };
      pass.set(name, run);
    }
    if (mutant === 0) {
      run.clean.set(result.file, observation);
      continue;
    }
    const witnesses = run.byMutant.get(mutant) ?? [];
    witnesses.push({
      observation,
      file: result.file,
      spec: wrapperSpecs.get(result.file) ?? "",
    });
    run.byMutant.set(mutant, witnesses);
  }
  return { pass, titles };
}

/**
 * The (spec, mutant) pairs the confirmation pass has to rerun, keyed by spec.
 * Only the spec that saw a mutant fail can confirm it, so a pair per spec is
 * what the rerun needs. One wrapper file per mutant for every spec in the run
 * is quadratic, and over a few hundred mutants it exceeds the system limit on
 * the length of a command line.
 */
export function failingPairs({ pass, titles }: CollectedPass) {
  const pairs = new Map<string, Set<number>>();
  const failingTitles = new Set<string>();
  for (const [name, run] of pass) {
    for (const [mutant, witnesses] of run.byMutant) {
      for (const witness of witnesses) {
        if (run.clean.get(witness.file)?.outcome !== "passed") {
          continue;
        }
        const broken = witness.observation;
        if (broken.outcome !== "failed" || !broken.observed) {
          continue;
        }
        if (witness.spec !== "") {
          const mutants = pairs.get(witness.spec) ?? new Set<number>();
          mutants.add(mutant);
          pairs.set(witness.spec, mutants);
        }
        failingTitles.add(titles.get(name) ?? name);
      }
    }
  }
  return { pairs, titles: [...failingTitles] };
}
