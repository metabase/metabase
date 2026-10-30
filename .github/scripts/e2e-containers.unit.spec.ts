import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { load } from "js-yaml";

const GITHUB = join(__dirname, "..");
const WORKFLOWS = join(GITHUB, "workflows");
const ROOT = join(GITHUB, "..");

const PREPARE_CONTAINERS = "./.github/actions/e2e-prepare-containers";

type Step = { uses?: string; with?: Record<string, unknown> };
type Workflow = { jobs?: Record<string, { steps?: Step[] }> };

/** Every `e2e-prepare-containers` step across the workflows, labelled with the job it lives in. */
const prepareContainerSteps = () =>
  readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .flatMap((file) => {
      // `js-yaml` returns `unknown`; the shape we read back is the slice of the workflow schema
      // declared above, and a workflow that does not match it simply contributes no steps.
      const workflow = load(
        readFileSync(join(WORKFLOWS, file), "utf8"),
      ) as Workflow;

      return Object.entries(workflow.jobs ?? {}).flatMap(([job, { steps }]) =>
        (steps ?? [])
          .filter((step) => step.uses === PREPARE_CONTAINERS)
          .map((step) => ({
            where: `${file} / ${job}`,
            with: step.with ?? {},
          })),
      );
    });

const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");

describe("e2e container setup", () => {
  it("finds the prepare-containers steps it is asserting over", () => {
    expect(prepareContainerSteps().length).toBeGreaterThan(0);
  });

  // The `:e2e` alias in deps.edn points the backend at both analytics collectors unconditionally,
  // so a job that starts one has to start the other. Letting them drift apart leaves a job posting
  // every event at a port nothing is listening on — bounded, thanks to the sender's circuit
  // breaker, but a confusing thing to find in a log.
  it("starts the Metabase Track sink wherever it starts Snowplow micro", () => {
    const missing = prepareContainerSteps()
      .filter(
        (step) => step.with.snowplow === true && step.with.metaplow !== true,
      )
      .map((step) => step.where);

    expect(missing).toEqual([]);
  });

  // Three files have to agree on the sink's port and nothing else ties them together: the alias
  // the backend is started with, the port the container publishes, and the readiness check CI
  // blocks on. The e2e helper hardcodes it a fourth time, but that one is covered by the specs.
  it("agrees on the Metabase Track sink's port", () => {
    const [, port] =
      read("deps.edn").match(
        /"-Dmb\.metaplow\.url=http:\/\/localhost:(\d+)\//,
      ) ?? [];

    expect(port).toBeDefined();
    expect(read("metaplow", "docker-compose.yml")).toContain(
      `"${port}:${port}"`,
    );
    expect(
      read(".github", "actions", "e2e-prepare-containers", "action.yml"),
    ).toContain(`nc -z localhost ${port}`);
  });
});
