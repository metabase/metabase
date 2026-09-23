#!/usr/bin/env bun
/**
 * Rolls a workflow's job results up into one answer: did everything the plan
 * asked for actually run, and pass?
 *
 * Every test workflow ends in a roll-up job that depends on all the others and
 * reports the suite's verdict. Those jobs used to each carry their own copy of
 * the same twenty lines of JavaScript, and a required check that never reports
 * -- because the job holding it was skipped when something upstream of it was
 * skipped -- is a pull request that can never merge. So the verdict is worked
 * out here instead, in one place, and published as an output the caller can
 * read back: `run-tests` gathers the outputs of every workflow it calls and
 * asks the same question once more, at the top, in a job that always runs.
 *
 * Three things feed a verdict, and all three have to hold:
 *
 *  - the results of the jobs the roll-up depends on: each has to have
 *    succeeded or been skipped;
 *  - the plan, which says which of them should have run -- a job that was
 *    planned and then skipped is a hole in the run that a green result would
 *    otherwise hide, and a job that ran when the plan ruled it out means the
 *    plan and the workflow have drifted apart;
 *  - whatever else the workflow worked out for itself, handed over as
 *    `checks`. That is where a called workflow's own `ok` output arrives, and
 *    where a bespoke script in a workflow puts its answer.
 *
 * Reads its inputs from the environment, the way the composite action in
 * .github/actions/aggregate-results sets them:
 *
 *   NEEDS       the `needs` context, as JSON -- `${{ toJSON(needs) }}`
 *   PLAN        the test plan, as JSON; `{}` means there is none
 *   WORKFLOW    the name this workflow goes by in the plan
 *   CHECKS      extra signals, one `name=value` per line
 *   UNREQUIRED  jobs to report on but leave out of the verdict, one per line
 *   FAIL        `false` to report the verdict without failing on it
 */

import {
  type Results,
  type TestPlan,
  appendSummary,
  parsePlan,
  verifyPlan,
  writeOutput,
} from "./test-plan";

/** Where a signal came from, which is all the reader needs to place it. */
export type Source = "job" | "plan" | "check";

export type Signal = {
  name: string;
  source: Source;
  /** What happened, in the vocabulary the source uses. */
  result: string;
  ok: boolean;
  detail: string;
  /** True for a signal that is reported and then left out of the verdict. */
  unrequired: boolean;
};

export type Aggregation = {
  signals: Signal[];
  ok: boolean;
};

/** Job results that do not sink the run: it passed, or it never happened. */
const PASSING_RESULTS = new Set(["success", "skipped"]);

/**
 * How a `checks:` value reads. `true`/`false` is what an `ok` output carries;
 * the job results are here too so a workflow can pass one straight through
 * without translating it first.
 */
const PASSING_CHECKS = new Set(["true", "success", "skipped"]);

export type AggregateInput = {
  /** The `needs` context: job name to `{ result }`. */
  results: Results;
  /** Extra signals, in the order they were given. */
  checks: [string, string][];
  /** Names -- of jobs or of checks -- that are reported but do not decide. */
  unrequired: string[];
  plan: TestPlan | null;
  workflow: string;
};

/**
 * Turns every signal into a line, and every line into part of the verdict.
 *
 * An unrequired name is still reported. Leaving it out altogether would make
 * the roll-up quieter about the one thing a reader is most likely to go
 * looking for -- what happened to the suite nobody is gating on.
 */
export function aggregate({
  results,
  checks,
  unrequired,
  plan,
  workflow,
}: AggregateInput): Aggregation {
  const optional = new Set(unrequired);
  const signals: Signal[] = [];

  for (const [name, { result }] of Object.entries(results)) {
    const outcome = result ?? "missing";

    signals.push({
      name,
      source: "job",
      result: outcome,
      ok: PASSING_RESULTS.has(outcome),
      detail: PASSING_RESULTS.has(outcome) ? "" : `the job ${outcome}`,
      unrequired: optional.has(name),
    });
  }

  for (const [name, value] of checks) {
    const reported = value.trim();

    // Nothing to report is not the same as a bad report: a workflow that was
    // skipped whole, or one with no `ok` output to give, leaves this empty,
    // and its job result is what speaks for it instead.
    if (reported === "") {
      signals.push({
        name,
        source: "check",
        result: "not reported",
        ok: true,
        detail: "nothing reported -- the job result speaks for it",
        unrequired: optional.has(name),
      });
      continue;
    }

    const ok = PASSING_CHECKS.has(reported.toLowerCase());

    signals.push({
      name,
      source: "check",
      result: reported,
      ok,
      detail: ok ? "" : `reported ${reported}`,
      unrequired: optional.has(name),
    });
  }

  if (plan) {
    for (const check of verifyPlan(plan, workflow, results)) {
      signals.push({
        name: check.job,
        source: "plan",
        result: check.result,
        ok: check.ok,
        detail: check.detail,
        unrequired: optional.has(check.job),
      });
    }
  }

  return {
    signals,
    ok: signals.every((signal) => signal.ok || signal.unrequired),
  };
}

/**
 * One `name=value` per line. A value may be empty -- that is how "the workflow
 * that would have answered this was skipped" arrives -- so the split is on the
 * first `=` only, and a line without one is a mistake worth saying out loud
 * rather than a signal quietly worth nothing.
 */
export function parseChecks(source: string): [string, string][] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const at = line.indexOf("=");

      if (at === -1) {
        throw new Error(`checks entry "${line}" is not \`name=value\``);
      }

      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    });
}

/** A list written one per line, or comma separated, or both. */
export function parseNames(source: string): string[] {
  return source
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

const MARKS: Record<Source, string> = {
  job: "job  ",
  plan: "plan ",
  check: "check",
};

export function describeAggregation({ signals, ok }: Aggregation): string {
  const width = Math.max(...signals.map(({ name }) => name.length), 0);

  const lines = signals.map((signal) => {
    const verdict = signal.ok ? "PASS" : signal.unrequired ? "WARN" : "FAIL";
    const detail = [signal.unrequired ? "(not required)" : "", signal.detail]
      .filter(Boolean)
      .join(" ");

    return `${verdict} ${MARKS[signal.source]} ${signal.name.padEnd(width)} ${signal.result.padEnd(9)} ${detail}`.trimEnd();
  });

  lines.push("");
  lines.push(
    ok
      ? "Everything the plan asked for ran and passed."
      : "Something the plan asked for did not run, or did not pass.",
  );

  return lines.join("\n");
}

function main(): number {
  const planSource = (process.env.PLAN ?? "{}").trim();
  const workflow = process.env.WORKFLOW ?? "";
  const plan =
    planSource === "" || planSource === "{}" ? null : parsePlan(planSource);

  if (plan && workflow === "") {
    throw new Error("a plan was given but no WORKFLOW to look it up under");
  }

  const aggregation = aggregate({
    results: JSON.parse(process.env.NEEDS ?? "{}") as Results,
    checks: parseChecks(process.env.CHECKS ?? ""),
    unrequired: parseNames(process.env.UNREQUIRED ?? ""),
    plan,
    workflow,
  });

  const report = describeAggregation(aggregation);

  console.log(report);

  writeOutput("ok", String(aggregation.ok));
  appendSummary(`## ${workflow || "Results"}\n\n\`\`\`\n${report}\n\`\`\`\n`);

  // The verdict is an output before it is an exit code: a caller that wanted
  // to read it and decide for itself passes FAIL=false and still gets one.
  if (!aggregation.ok && process.env.FAIL !== "false") {
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
