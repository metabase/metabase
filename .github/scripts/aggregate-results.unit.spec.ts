import {
  type Aggregation,
  aggregate,
  describeAggregation,
  parseChecks,
  parseNames,
} from "./aggregate-results";
import { type TestPlan, PLAN_VERSION } from "./test-plan";

const results = (jobs: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(jobs).map(([job, result]) => [job, { result }]),
  );

const planning = (jobs: Record<string, boolean>): TestPlan => ({
  version: PLAN_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  inputs: {
    event: "pull_request",
    ref: "feature",
    baseRef: "master",
    draft: false,
    labels: [],
    changedFiles: [],
    changedGroups: [],
  },
  override: null,
  workflows: {
    suite: {
      run: Object.values(jobs).some(Boolean),
      reason: "for the test",
      jobs: Object.fromEntries(
        Object.entries(jobs).map(([job, run]) => [
          job,
          { run, reason: "for the test" },
        ]),
      ),
    },
  },
});

const failures = ({ signals }: Aggregation) =>
  signals.filter((signal) => !signal.ok).map((signal) => signal.name);

describe("aggregate", () => {
  it("passes when every job succeeded or was skipped", () => {
    const verdict = aggregate({
      results: results({ ran: "success", ruled_out: "skipped" }),
      checks: [],
      unrequired: [],
      plan: null,
      workflow: "",
    });

    expect(verdict.ok).toBe(true);
  });

  it("fails on a job that did anything else", () => {
    const verdict = aggregate({
      results: results({ ran: "success", broke: "failure" }),
      checks: [],
      unrequired: [],
      plan: null,
      workflow: "",
    });

    expect(verdict.ok).toBe(false);
    expect(failures(verdict)).toEqual(["broke"]);
  });

  // The hole this whole thing exists to close: something upstream skips, the
  // job the plan asked for skips with it, and every result in sight is green.
  it("fails on a job the plan asked for that was skipped anyway", () => {
    const verdict = aggregate({
      results: results({ asked_for: "skipped" }),
      checks: [],
      unrequired: [],
      plan: planning({ asked_for: true }),
      workflow: "suite",
    });

    expect(verdict.ok).toBe(false);
    expect(failures(verdict)).toEqual(["asked_for"]);
  });

  it("fails on a job the plan ruled out that ran regardless", () => {
    const verdict = aggregate({
      results: results({ ruled_out: "success" }),
      checks: [],
      unrequired: [],
      plan: planning({ ruled_out: false }),
      workflow: "suite",
    });

    expect(verdict.ok).toBe(false);
  });

  it("reads a called workflow's own verdict as a check", () => {
    const verdict = aggregate({
      results: results({ suite: "success" }),
      checks: [["suite", "false"]],
      unrequired: [],
      plan: null,
      workflow: "",
    });

    expect(verdict.ok).toBe(false);
    expect(failures(verdict)).toEqual(["suite"]);
  });

  // A skipped workflow publishes no output at all, which says nothing about
  // whether it should have run -- its job result and the plan answer that.
  it("takes an empty check as nothing reported", () => {
    const verdict = aggregate({
      results: results({ suite: "skipped" }),
      checks: [["suite", ""]],
      unrequired: [],
      plan: null,
      workflow: "",
    });

    expect(verdict.ok).toBe(true);
  });

  it("reports an unrequired failure without failing on it", () => {
    const verdict = aggregate({
      results: results({ optional: "failure" }),
      checks: [],
      unrequired: ["optional"],
      plan: null,
      workflow: "",
    });

    expect(verdict.ok).toBe(true);
    expect(describeAggregation(verdict)).toContain("WARN");
  });
});

describe("parseChecks", () => {
  it("keeps a name whose value is empty", () => {
    expect(parseChecks("a=true\nb=\n\nc=false")).toEqual([
      ["a", "true"],
      ["b", ""],
      ["c", "false"],
    ]);
  });

  it("refuses a line that is not name=value", () => {
    expect(() => parseChecks("a")).toThrow('"a" is not `name=value`');
  });
});

describe("parseNames", () => {
  it("reads a list written either way", () => {
    expect(parseNames("a, b\nc\n")).toEqual(["a", "b", "c"]);
  });
});
