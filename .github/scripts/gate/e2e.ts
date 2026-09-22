// Whether the e2e suite runs, and the matrix it runs as.
//
// It narrows to the changed spec files when a pull request changed nothing else: the e2e_all filter
// covers every change that triggers the whole suite, so an e2e_all list identical to the e2e_specs
// list means specs were all that changed. Everything else runs the default glob -- a force-run
// reports every filter as matched, so without that guard a push to master that happened to touch
// only specs would silently run a narrowed suite.
//
// The suite is then split into chunks: a full run gets CHUNKS of them, three of which are reserved
// for the groups that select by tag rather than by path. A narrowed run gets only as many as its
// specs need, and no tag groups, because the changed specs are the whole of what there is to run.

import { appendFileSync } from "fs";

export const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";

// Total chunks a full run is split into, tag groups included.
export const CHUNKS = 50;

// How many changed specs one chunk of a narrowed run takes.
const SPECS_PER_CHUNK = 5;

type Leg = {
  name: string;
  runner: string;
  edition: string;
  tags?: string;
  specs?: string;
};

// Groups that select by tag, so they only make sense over the whole spec tree.
const TAG_LEGS = [
  {
    name: "oss-subset",
    edition: "oss",
    tags: "@OSS @prerelease+-@EE",
    specs: DEFAULT_SPEC_PATTERN,
  },
  { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  { name: "python", tags: "@python", specs: DEFAULT_SPEC_PATTERN },
];

type Matrix = { include: Leg[] };

type Plan = {
  // Keyed by job name, like the other gate scripts: null means the job sits the run out.
  "e2e-tests": Matrix | null;
  // Chunks the specs are split across, which each leg needs to find its own slice. The tag groups
  // are not part of the split, so they do not count towards it.
  "total-chunks": number;
};

type BuildOptions = {
  // A comma-separated list of changed specs, or '' for the whole tree.
  specs: string;
  runner: string;
  chunks?: number;
};

export function buildMatrix({ specs, runner, chunks = CHUNKS }: BuildOptions) {
  const wholeTree = specs === "" || specs === DEFAULT_SPEC_PATTERN;
  const changed = specs.split(",").filter(Boolean);

  const regularChunks = wholeTree
    ? chunks - TAG_LEGS.length
    : Math.max(1, Math.ceil(changed.length / SPECS_PER_CHUNK));

  const regular = Array.from({ length: regularChunks }, (_, index) => ({
    name: `e2e-group-${String(index + 1).padStart(2, "0")}`,
    // A run over the whole tree leaves `specs` unset, so each leg takes its slice by index
    // instead. A narrowed run hands each leg the specs it owns.
    ...(wholeTree
      ? {}
      : {
          specs: changed
            .slice(SPECS_PER_CHUNK * index, SPECS_PER_CHUNK * (index + 1))
            .join(","),
        }),
  }));

  const legs = wholeTree ? [...regular, ...TAG_LEGS] : regular;

  return {
    include: legs.map((leg) => ({ runner, edition: "ee", ...leg })),
    regularChunks,
  };
}

type PlanOptions = {
  run: boolean;
  forceRun?: boolean;
  pullRequest?: boolean;
  // The changed files behind each requested filter, as the shared gate reports them.
  files?: Record<string, string[]>;
  runner?: string;
  chunks?: number;
};

// The changed specs to run, or '' when the suite runs over the whole tree.
export function narrowSpecs({
  forceRun = false,
  pullRequest = false,
  files = {},
}: Omit<PlanOptions, "run">): string {
  const all = files.e2e_all ?? [];
  const specs = files.e2e_specs ?? [];

  return pullRequest && !forceRun && all.join(",") === specs.join(",")
    ? specs.join(",")
    : "";
}

export function planE2e({
  run,
  runner = "",
  chunks = CHUNKS,
  ...narrowing
}: PlanOptions): Plan {
  const specs = narrowSpecs(narrowing);
  const { include, regularChunks } = buildMatrix({ specs, runner, chunks });

  return {
    "e2e-tests": run ? { include } : null,
    "total-chunks": regularChunks,
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const options: PlanOptions = {
    run: process.env.RUN === "true",
    forceRun: process.env.FORCE_RUN === "true",
    pullRequest: process.env.EVENT_NAME === "pull_request",
    files: JSON.parse(process.env.FILES || "{}"),
    runner: process.env.DEFAULT_RUNNER ?? "",
  };

  const specs = narrowSpecs(options);
  const plan = planE2e(options);

  console.log(`specs: ${specs || "every spec"}`);
  console.log(`chunks: ${plan["total-chunks"]}`);
  console.log(
    `e2e-tests: ${plan["e2e-tests"] ? `${plan["e2e-tests"].include.length} legs` : "not running"}`,
  );
  plan["e2e-tests"]?.include.forEach((leg) => console.log(`  ${leg.name}`));

  // An empty value is how the job is told to sit this run out; its `if` is the only thing reading
  // it. The chunk count is consumed as a number, so it is written unquoted.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    `e2e-tests=${plan["e2e-tests"] ? JSON.stringify(plan["e2e-tests"]) : ""}\n` +
      `total-chunks=${plan["total-chunks"]}\n`,
  );
}
