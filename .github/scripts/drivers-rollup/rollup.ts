// Pure rollup decision: given the check-runs on a commit + the drivers config,
// decide the state/conclusion of the aggregate `drivers-tests-result` check.
//
//   - only "required" driver checks gate the result; "info"/"skip" never do
//   - any required check still running        -> in_progress (pending)
//   - any required check failed               -> completed / failure
//   - all required checks done & passing      -> completed / success
//   - a check missing from the config         -> treated as "required"

import {
  type ConfigEntry,
  type Status,
  checkLeafName,
  configIdForLeaf,
  statusForLeaf,
} from "./config";

export interface CheckRun {
  name: string;
  /** GitHub check-run status. */
  status: "queued" | "in_progress" | "completed" | (string & {});
  /** GitHub check-run conclusion (null until completed). */
  conclusion: string | null;
}

/** Conclusions that count as "this required check is satisfied". */
const PASS_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

export type Verdict = "pass" | "pending" | "fail" | "ignored";

export interface ConsideredCheck {
  name: string;
  leaf: string;
  configId: string | undefined;
  configStatus: Status;
  runStatus: string;
  conclusion: string | null;
  verdict: Verdict;
}

export interface RollupCounts {
  required: number;
  passing: number;
  pending: number;
  failing: number;
  info: number;
  skip: number;
  nonDriver: number;
}

export interface RollupResult {
  state: "in_progress" | "completed";
  conclusion: "success" | "failure" | null;
  title: string;
  considered: ConsideredCheck[];
  counts: RollupCounts;
}

export interface RollupOptions {
  /** Name of the aggregate check itself, so we never count it. */
  selfName?: string;
  /** Prefix every driver check leaf shares. */
  driverPrefix?: string;
}

export function computeRollup(
  checkRuns: CheckRun[],
  config: ConfigEntry[],
  options: RollupOptions = {},
): RollupResult {
  const selfName = options.selfName ?? "drivers-tests-result";
  const prefix = options.driverPrefix ?? "drivers-tests-";

  const considered: ConsideredCheck[] = [];
  const required: ConsideredCheck[] = [];
  let info = 0;
  let skip = 0;
  let nonDriver = 0;

  for (const run of checkRuns) {
    const leaf = checkLeafName(run.name);

    // Not a driver check, or it's our own aggregate → ignore entirely.
    if (
      !leaf.startsWith(prefix) ||
      leaf === selfName ||
      leaf.startsWith(`${selfName} (`)
    ) {
      nonDriver += 1;
      continue;
    }

    const configStatus = statusForLeaf(leaf, config);
    const check: ConsideredCheck = {
      name: run.name,
      leaf,
      configId: configIdForLeaf(leaf, config),
      configStatus,
      runStatus: run.status,
      conclusion: run.conclusion,
      verdict: "ignored",
    };

    if (configStatus !== "required") {
      // info / skip never affect the result.
      if (configStatus === "info") {
        info += 1;
      } else {
        skip += 1;
      }
      considered.push(check);
      continue;
    }

    if (run.status !== "completed") {
      check.verdict = "pending";
    } else if (PASS_CONCLUSIONS.has(run.conclusion ?? "")) {
      check.verdict = "pass";
    } else {
      check.verdict = "fail";
    }
    required.push(check);
    considered.push(check);
  }

  const failing = required.filter((c) => c.verdict === "fail");
  const pending = required.filter((c) => c.verdict === "pending");
  const passing = required.filter((c) => c.verdict === "pass");

  let state: RollupResult["state"];
  let conclusion: RollupResult["conclusion"];
  if (failing.length > 0) {
    state = "completed";
    conclusion = "failure";
  } else if (pending.length > 0) {
    state = "in_progress";
    conclusion = null;
  } else {
    state = "completed";
    conclusion = "success";
  }

  const title =
    conclusion === "failure"
      ? `${failing.length} required driver check(s) failed`
      : conclusion === "success"
        ? `All ${required.length} required driver check(s) passed`
        : `${passing.length}/${required.length} required driver checks complete`;

  return {
    state,
    conclusion,
    title,
    considered,
    counts: {
      required: required.length,
      passing: passing.length,
      pending: pending.length,
      failing: failing.length,
      info,
      skip,
      nonDriver,
    },
  };
}
