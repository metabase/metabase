import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFilters } from "./paths-filter";
import {
  type JobPlan,
  type PlanContext,
  type Scaffold,
  type TestPlan,
  createPlan,
  parseConfig,
  renderWorkflows,
  scaffoldWorkflows,
  validateGroups,
  withWorkflows,
} from "./test-plan";

// The config is the source of truth for what CI does, and the comment block at
// the top of it is the source of truth for what the config means. Each
// `describe` below is one of those rules, so a rule that stops holding fails
// next to the sentence that promised it.
const CONFIG = resolve(__dirname, "..", "test-plan.yaml");
const WORKFLOWS = resolve(__dirname, "..", "workflows");
const FILTERS = resolve(__dirname, "..", "file-paths.yaml");

/** The entry workflow the config describes, and the one `sync` reads. */
const ENTRY = "run-tests";

const ON_A_BRANCH: PlanContext = {
  event: "pull_request",
  ref: "feature",
  baseRef: "master",
  draft: false,
  labels: [],
};

const OVERRIDES = `
overrides:
  - id: protected-branch-master
    reason: master tests everything
    run:
      branch:
        - master
  - id: protected-branch-releases
    reason: release branches test everything
    run:
      branch:
        - release-x.*
  - id: skip-label
    reason: the skip label holds the whole run back
    skip:
      labels:
        - ci:skip
`;

function planOf(
  yaml: string,
  context: Partial<PlanContext> = {},
  changedGroups: string[] = [],
): TestPlan {
  return createPlan(parseConfig(yaml), { ...ON_A_BRANCH, ...context }, () => ({
    changedFiles: [],
    changedGroups,
  }));
}

function jobPlan(plan: TestPlan, path: string): JobPlan {
  const [workflow = "", job = ""] = path.split("/");
  const found = plan.workflows[workflow]?.jobs[job];

  if (!found) {
    throw new Error(`the plan has no job "${path}"`);
  }

  return found;
}

const ran = (plan: TestPlan, path: string): boolean => jobPlan(plan, path).run;
const why = (plan: TestPlan, path: string): string =>
  jobPlan(plan, path).reason;

/** Every job the plan runs, as `workflow/job`, in the order the config lists them. */
function running(plan: TestPlan): string[] {
  return Object.entries(plan.workflows).flatMap(([workflow, workflowPlan]) =>
    Object.entries(workflowPlan.jobs)
      .filter(([, job]) => job.run)
      .map(([job]) => `${workflow}/${job}`),
  );
}

/** Every workflow the plan runs, which is every one with a job left in it. */
function runningWorkflows(plan: TestPlan): string[] {
  return Object.entries(plan.workflows)
    .filter(([, workflow]) => workflow.run)
    .map(([workflow]) => workflow);
}

describe("overrides always take precedence over workflow level settings", () => {
  const yaml = `${OVERRIDES}
workflows:
  w:
    run:
      paths:
        - backend_all
    jobs:
      j:
        run:
          paths:
            - backend_all
      forced:
        force-skip:
          event:
            - push
      always:
`;

  it("runs a job whose own conditions, and its workflow's, are unmet", () => {
    const plan = planOf(yaml, { event: "push", ref: "master" });

    expect(ran(plan, "w/j")).toBe(true);
    expect(why(plan, "w/j")).toBe("master tests everything");
  });

  it("outranks force-skip, which tops the ladder below it", () => {
    const plan = planOf(yaml, { event: "push", ref: "master" });

    expect(ran(plan, "w/forced")).toBe(true);
  });

  it("holds back a job that would otherwise run unconditionally", () => {
    const plan = planOf(yaml, { labels: ["ci:skip"] }, ["backend_all"]);

    expect(ran(plan, "w/always")).toBe(false);
    expect(why(plan, "w/always")).toBe(
      "the skip label holds the whole run back",
    );
  });

  it("is recorded on the plan by id", () => {
    expect(planOf(yaml, { event: "push", ref: "master" }).override).toBe(
      "protected-branch-master",
    );
    expect(planOf(yaml).override).toBeNull();
  });
});

describe("`ignore-overrides` sits the listed overrides out", () => {
  const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      pr-only:
        run:
          ignore-overrides:
            - protected-branch-master
          event:
            - pull_request
      plain:
`;

  it("leaves the block decided by its own conditions, as on an ordinary run", () => {
    const plan = planOf(yaml, { event: "push", ref: "master" });

    expect(ran(plan, "w/pr-only")).toBe(false);
    expect(why(plan, "w/pr-only")).toContain("no run condition met");
    expect(why(plan, "w/pr-only")).toContain(
      "ignoring the protected-branch-master override",
    );
    // The override still settles everything that did not name it.
    expect(ran(plan, "w/plain")).toBe(true);
  });

  it("lets the block run where the override was not the reason", () => {
    const plan = planOf(yaml, { event: "pull_request", ref: "master" });

    expect(ran(plan, "w/pr-only")).toBe(true);
  });

  it("matches several overrides with a glob", () => {
    const globbed = `${OVERRIDES}
workflows:
  w:
    jobs:
      pr-only:
        run:
          ignore-overrides:
            - protected-branch-*
          event:
            - pull_request
`;

    for (const ref of ["master", "release-x.55.0"]) {
      expect(ran(planOf(globbed, { event: "push", ref }), "w/pr-only")).toBe(
        false,
      );
    }
  });

  it("is not a condition: it never makes a block match", () => {
    const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        run:
          ignore-overrides:
            - protected-branch-master
          paths:
            - backend_all
`;

    expect(ran(planOf(yaml, {}, []), "w/j")).toBe(false);
    expect(ran(planOf(yaml, {}, ["backend_all"]), "w/j")).toBe(true);
  });

  it("only sits out the overrides it names", () => {
    const plan = planOf(yaml, { labels: ["ci:skip"] });

    expect(ran(plan, "w/pr-only")).toBe(false);
    expect(why(plan, "w/pr-only")).toBe(
      "the skip label holds the whole run back",
    );
  });

  it("rejects an entry that reaches no override at all", () => {
    const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        run:
          ignore-overrides:
            - protected-brunch-*
          event:
            - pull_request
`;

    expect(() => parseConfig(yaml)).toThrow(/names no override/);
  });
});

describe("a workflow's conditions are checked before its jobs'", () => {
  const yaml = `${OVERRIDES}
workflows:
  w:
    run:
      paths:
        - backend_all
    jobs:
      backend:
        run:
          paths:
            - backend_all
      frontend:
        run:
          paths:
            - frontend_all
      always:
`;

  it("skips every job when the workflow's own condition fails", () => {
    const plan = planOf(yaml, {}, ["frontend_all"]);

    expect(plan.workflows.w?.run).toBe(false);

    for (const job of ["backend", "frontend", "always"]) {
      expect(ran(plan, `w/${job}`)).toBe(false);
      expect(why(plan, `w/${job}`)).toContain("the w workflow is skipped");
    }
  });

  it("skips a job whose conditions are narrower than the workflow's", () => {
    // The workflow lets the job be considered; the job still answers for itself.
    const plan = planOf(yaml, {}, ["backend_all"]);

    expect(ran(plan, "w/backend")).toBe(true);
    expect(ran(plan, "w/frontend")).toBe(false);
    expect(why(plan, "w/frontend")).toContain("no run condition met");
  });

  it("runs a job with no conditions of its own once the gate is open", () => {
    expect(ran(planOf(yaml, {}, ["backend_all"]), "w/always")).toBe(true);
  });
});

describe("`condition: all` is the default", () => {
  // The example from the syntax comment: a label AND this is a PR == skipped.
  const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        skip:
          labels:
            - skip-all
          event:
            - pull_request
`;

  it("needs every condition in the block", () => {
    expect(ran(planOf(yaml, { labels: ["skip-all"] }), "w/j")).toBe(false);
  });

  it("leaves the block unmatched when only one of them holds", () => {
    expect(
      ran(planOf(yaml, { labels: ["skip-all"], event: "push" }), "w/j"),
    ).toBe(true);
    expect(ran(planOf(yaml, { labels: [] }), "w/j")).toBe(true);
  });
});

describe("`condition: any` needs one condition", () => {
  const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        run:
          condition: any
          labels:
            - ci:run-j
          event:
            - workflow_dispatch
          branch:
            - main
          paths:
            - backend_all
`;

  const alone: [string, Partial<PlanContext>, string[]][] = [
    ["a label", { labels: ["ci:run-j"] }, []],
    ["an event", { event: "workflow_dispatch" }, []],
    ["a branch", { ref: "main" }, []],
    ["a path group", {}, ["backend_all"]],
  ];

  it.each(alone)("runs on %s alone", (_what, context, groups) => {
    expect(ran(planOf(yaml, context, groups), "w/j")).toBe(true);
  });

  it("skips when none of them hold", () => {
    expect(ran(planOf(yaml), "w/j")).toBe(false);
  });
});

describe("run beats skip when both match", () => {
  const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        run:
          event:
            - pull_request
        skip:
          branch:
            - feature
`;

  it("runs, and says what it overruled", () => {
    const plan = planOf(yaml);

    expect(ran(plan, "w/j")).toBe(true);
    expect(why(plan, "w/j")).toContain("beats the matching skip condition");
  });

  it("still skips when only the skip matches", () => {
    expect(ran(planOf(yaml, { event: "push" }), "w/j")).toBe(false);
  });
});

describe("force-skip beats run", () => {
  it("holds a job back even when its run condition asks for it", () => {
    const yaml = `${OVERRIDES}
workflows:
  w:
    jobs:
      j:
        force-skip:
          event:
            - pull_request
        run:
          event:
            - pull_request
`;
    const plan = planOf(yaml);

    expect(ran(plan, "w/j")).toBe(false);
    expect(why(plan, "w/j")).toContain("force-skip condition met");
  });

  it("holds a whole workflow back", () => {
    const yaml = `${OVERRIDES}
workflows:
  w:
    force-skip:
      event:
        - pull_request
    jobs:
      j:
        run:
          event:
            - pull_request
`;
    const plan = planOf(yaml);

    expect(plan.workflows.w?.run).toBe(false);
    expect(ran(plan, "w/j")).toBe(false);
  });

  it("is barred from an override, which already outranks it", () => {
    const yaml = `
overrides:
  - id: nope
    force-skip:
      event:
        - push
workflows:
  w:
    jobs:
      j:
`;

    expect(() => parseConfig(yaml)).toThrow(/cannot use \`force-skip\`/);
  });
});

describe("a calling job's blocks gate the workflow it calls", () => {
  const yaml = `${OVERRIDES}
workflows:
  outer:
    jobs:
      call-inner:
        calls: inner
        run:
          labels:
            - ci:inner
  inner:
    jobs:
      j:
`;

  it("skips everything in the called workflow when the call does not happen", () => {
    const plan = planOf(yaml);

    expect(ran(plan, "outer/call-inner")).toBe(false);
    expect(plan.workflows.inner?.run).toBe(false);
    expect(why(plan, "inner/j")).toContain(
      "the outer workflow does not call it",
    );
  });

  it("takes precedence over the called workflow's own conditionals", () => {
    const always = `${OVERRIDES}
workflows:
  outer:
    jobs:
      call-inner:
        calls: inner
        force-skip:
          event:
            - pull_request
  inner:
    run:
      event:
        - pull_request
    jobs:
      j:
        run:
          event:
            - pull_request
`;
    const plan = planOf(always);

    expect(ran(plan, "inner/j")).toBe(false);
  });

  it("hands the call back to the called workflow's own jobs once it happens", () => {
    const plan = planOf(yaml, { labels: ["ci:inner"] });

    expect(ran(plan, "inner/j")).toBe(true);
    expect(ran(plan, "outer/call-inner")).toBe(true);
    expect(why(plan, "outer/call-inner")).toBe(
      "the inner workflow has jobs to run",
    );
  });

  // The plan and GitHub have to agree here: a calling job whose `if:` is false
  // means the called workflow never starts, so nothing in it can run however
  // loudly an override asks for it.
  it("gates the call even when an override has settled everything else", () => {
    const sitsOut = `${OVERRIDES}
workflows:
  outer:
    jobs:
      call-inner:
        calls: inner
        run:
          ignore-overrides:
            - protected-branch-*
          event:
            - pull_request
  inner:
    jobs:
      j:
`;
    const plan = planOf(sitsOut, { event: "push", ref: "master" });

    expect(ran(plan, "outer/call-inner")).toBe(false);
    expect(plan.workflows.inner?.run).toBe(false);
    expect(why(plan, "inner/j")).toContain(
      "the outer workflow does not call it",
    );
  });

  it("lets an override through a call that did not sit it out", () => {
    const plan = planOf(yaml, { event: "push", ref: "master" });

    expect(ran(plan, "outer/call-inner")).toBe(true);
    expect(ran(plan, "inner/j")).toBe(true);
    expect(why(plan, "inner/j")).toBe("master tests everything");
  });

  it("skips the calling job when nothing inside has work to do", () => {
    const nothing = `${OVERRIDES}
workflows:
  outer:
    jobs:
      call-inner:
        calls: inner
  inner:
    jobs:
      j:
        run:
          paths:
            - backend_all
`;
    const plan = planOf(nothing);

    expect(ran(plan, "outer/call-inner")).toBe(false);
    expect(why(plan, "outer/call-inner")).toBe(
      "nothing to run in the inner workflow",
    );
  });
});

describe("an unmatched run condition holds back everything under it", () => {
  // Three deep, so each level has something below it to hold back: outer has
  // its own jobs and calls middle, middle has its own and calls inner.
  const yaml = `${OVERRIDES}
workflows:
  outer:
    run:
      paths:
        - backend_all
    jobs:
      j:
        run:
          labels:
            - ci:j
      always:
      call-middle:
        calls: middle
        run:
          labels:
            - ci:call-middle
  middle:
    run:
      labels:
        - ci:middle
    jobs:
      m:
      call-inner:
        calls: inner
  inner:
    jobs:
      i:
`;

  const EVERYTHING = ["ci:j", "ci:call-middle", "ci:middle"];

  const planWith = (labels: string[], groups = ["backend_all"]): TestPlan =>
    planOf(yaml, { labels }, groups);

  const without = (label: string): string[] =>
    EVERYTHING.filter((entry) => entry !== label);

  // Without this the rest could pass on a fixture that never runs anything.
  it("runs the lot when every condition is met", () => {
    expect(running(planWith(EVERYTHING))).toEqual([
      "outer/j",
      "outer/always",
      "outer/call-middle",
      "middle/m",
      "middle/call-inner",
      "inner/i",
    ]);
  });

  it("skips the job whose own condition is unmet, and only that job", () => {
    const plan = planWith(without("ci:j"));

    expect(ran(plan, "outer/j")).toBe(false);
    expect(why(plan, "outer/j")).toBe("no run condition met: labels: ci:j");
    expect(running(plan)).toContain("outer/always");
  });

  it("skips every job in a workflow whose own condition is unmet", () => {
    // The gate is the workflow's, so even the job that asked to run is held
    // back, and so is the one that never had a condition to fail.
    const plan = planWith(EVERYTHING, []);

    expect(running(plan)).toEqual([]);
    expect(runningWorkflows(plan)).toEqual([]);
    expect(why(plan, "outer/always")).toContain(
      "the outer workflow is skipped",
    );
  });

  it("skips the whole subtree below a call that does not happen", () => {
    const plan = planWith(without("ci:call-middle"));

    expect(running(plan)).toEqual(["outer/j", "outer/always"]);
    expect(runningWorkflows(plan)).toEqual(["outer"]);
    // Two levels down, for a call it took no part in.
    expect(why(plan, "inner/i")).toContain("the middle workflow is skipped");
  });

  it("skips a called workflow whose own condition is unmet", () => {
    const plan = planWith(without("ci:middle"));

    expect(running(plan)).toEqual(["outer/j", "outer/always"]);
    // The call happened; there was simply nothing in it to do.
    expect(why(plan, "outer/call-middle")).toBe(
      "nothing to run in the middle workflow",
    );
    expect(why(plan, "middle/m")).toContain("the middle workflow is skipped");
  });

  it("leaves an override whose run condition is unmet out of it entirely", () => {
    // The top level: an override is a run condition like any other, and one
    // that does not match settles nothing, leaving each job its own question.
    const plan = planWith(EVERYTHING);

    expect(plan.override).toBeNull();
    expect(running(planWith(without("ci:j")))).not.toContain("outer/j");
  });
});

describe("sync keeps what the config already says", () => {
  const scaffold: Scaffold = {
    outer: [{ job: "call-inner", calls: "inner" }, { job: "plain" }],
    inner: [{ job: "j" }],
  };

  const config = `workflows:
  outer:
    jobs:
      call-inner:
        calls: inner
        run:
          # only on a pull request
          event:
            - pull_request
      plain:
        run:
          paths:
            - backend_all

  inner:
    run:
      paths:
        - backend_all
    jobs:
      j:
`;

  /** The `workflows:` block a sync would write for these workflow files. */
  const synced = (from: Scaffold): string => renderWorkflows(from, config);

  it("keeps the conditions on a job that calls a workflow", () => {
    expect(synced(scaffold)).toContain("        calls: inner\n");
    expect(synced(scaffold)).toContain("          # only on a pull request\n");
    expect(synced(scaffold)).toContain("            - pull_request\n");
  });

  it("is a no-op on a config that already matches the workflows", () => {
    expect(withWorkflows(config, synced(scaffold))).toBe(config);
  });

  it("takes the call itself from the workflow files", () => {
    const moved: Scaffold = {
      outer: [{ job: "call-inner", calls: "elsewhere" }, { job: "plain" }],
      inner: [{ job: "j" }],
      elsewhere: [{ job: "k" }],
    };

    expect(synced(moved)).toContain("calls: elsewhere");
    expect(synced(moved)).not.toContain("calls: inner");
  });

  it("drops a call the workflow file no longer makes, keeping the conditions", () => {
    const plain: Scaffold = {
      outer: [{ job: "call-inner" }, { job: "plain" }],
      inner: [{ job: "j" }],
    };

    expect(synced(plain)).not.toContain("calls:");
    expect(synced(plain)).toContain("          # only on a pull request\n");
  });
});

describe(".github/test-plan.yaml", () => {
  const source = readFileSync(CONFIG, "utf8");
  const config = parseConfig(source);

  const read = async (workflow: string): Promise<string> => {
    for (const extension of [".yml", ".yaml"]) {
      const path = resolve(WORKFLOWS, `${workflow}${extension}`);

      if (existsSync(path)) {
        return readFileSync(path, "utf8");
      }
    }

    throw new Error(`no workflow file for "${workflow}"`);
  };

  it("only filters on path groups file-paths.yaml declares", () => {
    expect(() =>
      validateGroups(
        config,
        Object.keys(parseFilters(readFileSync(FILTERS, "utf8"))),
      ),
    ).not.toThrow();
  });

  it("describes every job of every workflow the entry one reaches", () => {
    expect(Object.keys(config.workflows)).toContain(ENTRY);
  });

  // Almost every job in this file is gated by something, its own condition or
  // an ancestor's, so a run with nothing changed, no labels and an ordinary
  // branch costs next to nothing. The exceptions are the jobs that have to run
  // before anyone can say what else should: the plan itself, and the check for
  // an uberjar that four other workflows take as a `needs:`. Each of them is a
  // few minutes on a slim runner, and each is listed here so that adding a
  // fifth is a decision rather than an accident.
  it("runs only the jobs that decide the run when no condition matches", () => {
    const plan = createPlan(
      config,
      {
        event: "push",
        ref: "feature",
        baseRef: "master",
        draft: false,
        labels: [],
      },
      () => ({ changedFiles: [], changedGroups: [] }),
    );

    expect(plan.override).toBeNull();
    expect(running(plan)).toEqual([
      "run-tests/should-run",
      "run-tests/uberjar",
      "should-run/static-viz",
      "uberjar/setup",
    ]);
    expect(runningWorkflows(plan)).toEqual([
      "run-tests",
      "should-run",
      "uberjar",
    ]);
  });

  // The jobs that hand a jar to something else, and the ones that take one.
  // GitHub skips a job whose `needs:` were skipped, so a skipped uberjar takes
  // all four of these down with it -- and a required check attached to a job
  // that never runs is a pull request that can never merge. Hence the rule:
  // whatever the diff, whatever the labels, if one of these is planned then
  // `uberjar` is planned too, and run-tests can depend on it plainly.
  describe("uberjar-dependent jobs", () => {
    const DEPENDENTS = [
      "containerize",
      "e2e-tests",
      "sdk-tests",
      "bundle-size",
    ];

    /** Every path group, every label and every event the config mentions. */
    const filters = Object.keys(parseFilters(readFileSync(FILTERS, "utf8")));
    const labels = [
      "ci:run-all",
      "ci:skip",
      "build-docker-uberjar",
      "ci:run-semantic-search-tests",
    ];
    const events = ["pull_request", "push"];
    const refs = ["feature", "master", "release-x.57.x"];

    /**
     * One change at a time, on each branch and event. A group on its own is
     * the hardest case for this rule: a diff touching several only ever runs
     * more, so the narrow ones are where a gap would open up.
     */
    const situations = events.flatMap((event) =>
      refs.flatMap((ref) =>
        filters.flatMap((group) =>
          [null, ...labels].map((label) => ({
            what: `${event} on ${ref}, ${group}${label ? `, ${label}` : ""}`,
            context: {
              event,
              ref,
              baseRef: "master",
              draft: false,
              labels: label ? [label] : [],
            },
            group,
          })),
        ),
      ),
    );

    it("never plans one without planning the uberjar", () => {
      const gaps = situations.filter(({ context, group }) => {
        const jobs = createPlan(config, context, () => ({
          changedFiles: [`${group}-file`],
          changedGroups: [group],
        })).workflows[ENTRY].jobs;

        return DEPENDENTS.some((job) => jobs[job]?.run) && !jobs.uberjar?.run;
      });

      expect(gaps.map(({ what }) => what)).toEqual([]);
    });

    // The half of the rule that costs nothing: `setup` only looks for a jar
    // that already exists, so it is never the reason a run is skipped.
    it("asks whether a jar exists on every run the plan does not skip whole", () => {
      const asked = situations.filter(({ context, group }) => {
        const plan = createPlan(config, context, () => ({
          changedFiles: [`${group}-file`],
          changedGroups: [group],
        }));

        return (
          plan.override !== "skip-label" &&
          !plan.workflows.uberjar.jobs.setup.run
        );
      });

      expect(asked.map(({ what }) => what)).toEqual([]);
    });
  });

  // `sync` rewrites this file in place, and everything in it that matters --
  // the conditions, the comments beside them -- is written by hand. A sync
  // that changes a byte of a config already in step with the workflows is
  // losing something someone wrote.
  it("survives a sync unchanged", async () => {
    const scaffold = await scaffoldWorkflows(ENTRY, read);

    expect(withWorkflows(source, renderWorkflows(scaffold, source))).toBe(
      source,
    );
  });
});
