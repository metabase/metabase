// Whether the e2e suite runs, and which specs it runs.
//
// It narrows to the changed spec files when a pull request changed nothing else: the e2e_all filter
// covers every change that triggers the whole suite, so an e2e_all list identical to the e2e_specs
// list means specs were all that changed. Everything else leaves the matrix builder on its default
// glob -- a force-run reports every filter as matched, so without that guard a push to master that
// happened to touch only specs would silently run a narrowed suite.

import { appendFileSync } from "fs";

type Plan = {
  // Keyed by job name, like the other gate scripts: null means the job sits the run out.
  "e2e-tests": true | null;
  // The spec pattern the matrix builder chunks. Empty leaves it on its default glob: every spec.
  specs: string;
};

type PlanOptions = {
  run: boolean;
  forceRun?: boolean;
  pullRequest?: boolean;
  // The changed files behind each requested filter, as the shared gate reports them.
  files?: Record<string, string[]>;
};

export function planE2e({
  run,
  forceRun = false,
  pullRequest = false,
  files = {},
}: PlanOptions): Plan {
  const all = files.e2e_all ?? [];
  const specs = files.e2e_specs ?? [];
  const specsOnly =
    pullRequest && !forceRun && all.join(",") === specs.join(",");

  return {
    "e2e-tests": run || null,
    specs: specsOnly ? specs.join(",") : "",
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const plan = planE2e({
    run: process.env.RUN === "true",
    forceRun: process.env.FORCE_RUN === "true",
    pullRequest: process.env.EVENT_NAME === "pull_request",
    files: JSON.parse(process.env.FILES || "{}"),
  });

  console.log(`e2e-tests: ${plan["e2e-tests"] ? "running" : "not running"}`);
  console.log(`specs: ${plan.specs || "every spec"}`);

  // An empty value is how the job is told to sit this run out; its `if` is the only thing reading
  // it. The spec list is consumed as a plain string, so it is written unquoted.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    `e2e-tests=${plan["e2e-tests"] ? "true" : ""}\n` + `specs=${plan.specs}\n`,
  );
}
