// Whether the Loki visual test runs, and whether it narrows itself to a story selection.
//
// It runs unless the gate turned the suite off or the run's test plan selected no stories at all.
// Only a narrowed selection travels on, as the artifact id the test job re-reads to write its own
// story list; anything else leaves it empty and every story is built.

import { appendFileSync } from "fs";

// What the run's test plan left the suite to do, as prepare-test-selection reports it. An empty
// string means there was no usable plan, and every story runs.
type Selection = "" | "full" | "narrowed" | "empty";

type Plan = {
  // Keyed by job name, like the other gate scripts: null means the job sits the run out.
  "visual-test": true | null;
  // Read by the test job, which re-reads the plan for its own story list.
  "test-plan-artifact-id": string;
};

type PlanOptions = {
  run: boolean;
  selection?: Selection;
  testPlanArtifactId?: string;
};

export function planLoki({
  run,
  selection = "",
  testPlanArtifactId = "",
}: PlanOptions): Plan {
  // Building a Storybook and booting the Docker service to render nothing is pure cost.
  const visualTest = run && selection !== "empty";

  return {
    "visual-test": visualTest || null,
    "test-plan-artifact-id":
      visualTest && selection === "narrowed" ? testPlanArtifactId : "",
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const selection = (process.env.SELECTION ?? "") as Selection;
  const plan = planLoki({
    run: process.env.RUN === "true",
    selection,
    testPlanArtifactId: process.env.TEST_PLAN_ARTIFACT_ID ?? "",
  });

  console.log(`story selection: ${selection || "none"}`);
  console.log(`visual-test: ${plan["visual-test"] ? "running" : "not running"}`);

  // An empty value is how the job is told to sit this run out; its `if` is the only thing reading
  // it. The artifact id is consumed as a plain string, so it is written unquoted.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    `visual-test=${plan["visual-test"] ? "true" : ""}\n` +
      `test-plan-artifact-id=${plan["test-plan-artifact-id"]}\n`,
  );
}
