/**
 * Classifies each mutant from the per-test results of the fast pass (all
 * mutants in one jest run) and the confirmation pass (the failing pairs again,
 * one module registry per mutant).
 *
 * A mutant is caught only by a test that passes on clean code, fails with an
 * assertion when the mutant is on, and does both again in the confirmation
 * pass. Any other failure is unmeasured.
 */

export type Outcome = "passed" | "failed" | "other";

export interface Observation {
  outcome: Outcome;
  assertion: boolean;
}

/** testName -> mutantId -> observation; mutant 0 is the clean run. */
export type PassResults = Map<string, Map<number, Observation>>;

export type MutantVerdict =
  | { status: "caught"; by: string[] }
  | { status: "survived"; ranBy: number }
  | { status: "unmeasured"; reason: string };

const ASSERTION_RE =
  /expect\(|Expected|Received|toHave|toBe|toEqual|toMatch|toContain|Unable to find|TestingLibraryElementError|AssertionError|toThrow|Found multiple elements/;

export function classifyFailure(messages: string[]): Observation {
  const text = messages.join("\n");
  return { outcome: "failed", assertion: ASSERTION_RE.test(text) };
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
    if (broken.outcome !== "failed" || !broken.assertion) {
      reasons.push(
        `${test}: ${broken.outcome === "failed" ? "error, not an assertion" : "did not finish"}`,
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
      confirmedBroken.assertion
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
