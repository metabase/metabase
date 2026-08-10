// Builds the affected-tests plan from raw inputs: computes the rules and usage
// affected-module sets and selects, per suite, which specs to run under each.
import { getFeatureModules } from "../../frontend/lint/module-boundaries.mjs";

import {
  type FileDependency,
  type ModuleDef,
  type ModuleNode,
  type Rule,
  buildModuleGraph,
  buildUsageModuleGraph,
  getAffectedModules,
  getChangedModules,
  mapFileToModule,
} from "./affected-modules";

export type TestPlanStats = {
  fe_files_changed: number;
  fe_files_total: number;
  be_files_changed: number;
  be_files_total: number;
  unit_infra_touched: boolean;
  loki_infra_touched: boolean;
  shared_sources_touched: boolean;
  fe_modules_total: number;
  fe_modules_changed: number;
  fe_modules_affected_rules: number;
  fe_modules_affected_usage: number;
  unit_specs_all: number;
  unit_specs_to_run_rules: number;
  unit_specs_to_run_usage: number;
  loki_stories_all: number;
  loki_stories_to_run_rules: number;
  loki_stories_to_run_usage: number;
  e2e_specs_all: number;
  e2e_specs_to_run_rules: number;
  e2e_specs_to_run_usage: number;
};

export type TestPlan = {
  stats: TestPlanStats;
  fe_unit_specs_to_run: string[];
  loki_stories_to_run: string[];
  e2e_specs_to_run: string[];
};

// The GitHub event a plan is computed for. Events the planner does not
// recognize collapse to "other" and plan like a push: COMPREHENSIVE.
export type GithubEvent = "pull_request" | "merge_group" | "push" | "other";

export function parseGithubEvent(value: string): GithubEvent {
  return value === "pull_request" || value === "merge_group" || value === "push"
    ? value
    : "other";
}

// Modes govern how much of a suite runs when it runs at all - a suite with
// no relevant change is skipped in either mode.
export type TestSelectionMode = "SELECTIVE" | "COMPREHENSIVE";

// Pull requests narrow to the affected tests, because a selection mistake
// there is still caught by the merge queue. Everywhere else - the queue
// itself, pushes to master - is a last gate, so suites run whole.
export function testSelectionModeFor(githubEvent: GithubEvent): TestSelectionMode {
  return githubEvent === "pull_request" ? "SELECTIVE" : "COMPREHENSIVE";
}

export type CreateTestPlanInput = {
  elements: ModuleDef[];
  rules: Rule[];
  changedFiles: string[];
  // The GitHub event this plan is for; it decides the selection mode.
  githubEvent: GithubEvent;
  // Parsed dependency-cruiser edges, or null to fall back to the rules graph.
  fileDependencies: FileDependency[] | null;
  testFilesBySuite: { unit: string[]; loki: string[]; e2e: string[] };
  e2eSpecFiles: Record<string, string[]> | null;
  unitInfraTouched: boolean;
  lokiInfraTouched: boolean;
  e2eInfraTouched: boolean;
  sharedSourcesTouched: boolean;
  feFilesChanged: number;
  beFilesChanged: number;
  feFilesTotal: number;
  beFilesTotal: number;
};

export function createTestPlan({
  elements,
  rules,
  changedFiles,
  githubEvent,
  fileDependencies,
  testFilesBySuite,
  e2eSpecFiles,
  unitInfraTouched,
  lokiInfraTouched,
  e2eInfraTouched,
  sharedSourcesTouched,
  feFilesChanged,
  beFilesChanged,
  feFilesTotal,
  beFilesTotal,
}: CreateTestPlanInput): TestPlan {
  // Step 1: decide the test selection mode from the event.
  const testSelectionMode = testSelectionModeFor(githubEvent);

  // Step 2: build the module graphs and map the change onto them.
  const rulesGraph = buildModuleGraph(elements, rules);
  const usageGraph = fileDependencies
    ? buildUsageModuleGraph(elements, fileDependencies)
    : rulesGraph;

  const nodes = rulesGraph.nodes;
  // Distinct module types (an element type can span several patterns).
  const totalModules = new Set(elements.map((el) => el.type)).size;
  const changedModules = getChangedModules(nodes, changedFiles);
  const rulesAffected = getAffectedModules(rulesGraph, changedFiles);
  const usageAffected = getAffectedModules(usageGraph, changedFiles);

  // The coarse "feature" tier is the only set the e2e manifest is ever
  // collapsed to (see filterAffectedE2eSpecs).
  const featureModules = new Set(getFeatureModules(elements));

  // Step 3: derive the signals that force a suite to run in full.
  // cljc/cljs compile into the FE bundle, so they force a full run that module
  // selection can't narrow — same effect as a suite's own infra changing.
  const unitForceAll = unitInfraTouched || sharedSourcesTouched;
  const lokiForceAll = lokiInfraTouched || sharedSourcesTouched;
  // e2e is integration-level, so anything the FE-coverage manifest can't see
  // forces a full run: cljc/cljs in the bundle (sharedSourcesTouched), a backend
  // change that can break the UI (beFilesChanged), an e2e harness/support change
  // (e2eInfraTouched), or no manifest at all.
  const e2eForceAll =
    sharedSourcesTouched ||
    e2eInfraTouched ||
    beFilesChanged > 0 ||
    e2eSpecFiles === null;

  // Step 4: decide which of each suite's tests run, per graph.
  const { unit, loki, e2e } = testFilesBySuite;

  // Precompute spec -> feature modules once (null when e2e never narrows).
  const specFeatures =
    testSelectionMode === "COMPREHENSIVE" ||
    e2eForceAll ||
    e2eSpecFiles === null
      ? null
      : specFeatureModules(nodes, featureModules, e2eSpecFiles);
  // A spec that was itself edited always runs, even when no app module changed.
  const changedSet = new Set(changedFiles);

  const affectedUnit = (affected: Set<string>) =>
    filterAffectedTests(nodes, affected, unit);
  const affectedLoki = (affected: Set<string>) =>
    filterAffectedTests(nodes, affected, loki);
  const affectedE2e = (affected: Set<string>): string[] => {
    if (specFeatures === null) {
      return e2e;
    }
    const narrowed = new Set(
      filterAffectedE2eSpecs(specFeatures, affected, e2e),
    );
    return e2e.filter((spec) => narrowed.has(spec) || changedSet.has(spec));
  };

  // Which of one suite's tests run, in order of precedence.
  // A force-all signal wins in either mode,
  // and COMPREHENSIVE ignores the module graph on purpose,
  // so a graph mistake can never skip a suite at the last gate before master.
  const selectTestsToRun = (
    forceAll: boolean,
    affected: Set<string>,
    files: string[],
    affectedTests: (affected: Set<string>) => string[],
  ): string[] => {
    if (forceAll) {
      return files;
    }
    if (testSelectionMode === "SELECTIVE") {
      return affectedTests(affected);
    }
    return feFilesChanged > 0 ? files : [];
  };

  const unitRules = selectTestsToRun(
    unitForceAll,
    rulesAffected,
    unit,
    affectedUnit,
  );
  const unitUsage = selectTestsToRun(
    unitForceAll,
    usageAffected,
    unit,
    affectedUnit,
  );
  const lokiRules = selectTestsToRun(
    lokiForceAll,
    rulesAffected,
    loki,
    affectedLoki,
  );
  const lokiUsage = selectTestsToRun(
    lokiForceAll,
    usageAffected,
    loki,
    affectedLoki,
  );
  const e2eRules = selectTestsToRun(
    e2eForceAll,
    rulesAffected,
    e2e,
    affectedE2e,
  );
  const e2eUsage = selectTestsToRun(
    e2eForceAll,
    usageAffected,
    e2e,
    affectedE2e,
  );

  // Step 5: emit the plan and its stats.
  return {
    stats: {
      fe_files_changed: feFilesChanged,
      fe_files_total: feFilesTotal,
      be_files_changed: beFilesChanged,
      be_files_total: beFilesTotal,
      unit_infra_touched: unitInfraTouched,
      loki_infra_touched: lokiInfraTouched,
      shared_sources_touched: sharedSourcesTouched,
      fe_modules_total: totalModules,
      fe_modules_changed: changedModules.size,
      fe_modules_affected_rules: rulesAffected.size,
      fe_modules_affected_usage: usageAffected.size,
      unit_specs_all: unit.length,
      unit_specs_to_run_rules: unitRules.length,
      unit_specs_to_run_usage: unitUsage.length,
      loki_stories_all: loki.length,
      loki_stories_to_run_rules: lokiRules.length,
      loki_stories_to_run_usage: lokiUsage.length,
      e2e_specs_all: e2e.length,
      e2e_specs_to_run_rules: e2eRules.length,
      e2e_specs_to_run_usage: e2eUsage.length,
    },
    fe_unit_specs_to_run: unitUsage,
    loki_stories_to_run: lokiUsage,
    e2e_specs_to_run: e2eUsage,
  };
}

// Tests whose owning module is affected.
export function filterAffectedTests(
  nodes: ModuleNode[],
  affected: Set<string>,
  testFiles: string[],
): string[] {
  return testFiles.filter((file) => {
    const module = mapFileToModule(nodes, file);
    return module !== null && affected.has(module);
  });
}

// Collapse each spec's covered files to the *feature* modules it exercises,
// once, for reuse across the rules/usage selects. Non-feature tiers
// (shared/lib/...) are intentionally dropped: the manifest is a stale nightly
// artifact, so its coupling to the module graph stays minimal ("does this spec
// touch feature X?"). Accuracy comes from the fresh `affected` set, which
// already expands a shared/infra change into the feature modules that depend on
// it.
export function specFeatureModules(
  nodes: ModuleNode[],
  featureModules: Set<string>,
  specFiles: Record<string, string[]>,
): Map<string, Set<string>> {
  const moduleCache = new Map<string, string | null>();
  const moduleOf = (file: string): string | null => {
    let module = moduleCache.get(file);
    if (module === undefined) {
      module = mapFileToModule(nodes, file);
      moduleCache.set(file, module);
    }
    return module;
  };

  const result = new Map<string, Set<string>>();
  for (const [spec, files] of Object.entries(specFiles)) {
    const features = new Set<string>();
    for (const file of files) {
      const module = moduleOf(file);
      if (module !== null && featureModules.has(module)) {
        features.add(module);
      }
    }
    result.set(spec, features);
  }
  return result;
}

// A spec runs if any feature module it covers is affected.
// A spec doesn't map to any feature module always runs because its scope is unknown
export function filterAffectedE2eSpecs(
  specFeatures: Map<string, Set<string>>,
  affected: Set<string>,
  e2eSpecs: string[],
): string[] {
  return e2eSpecs.filter((spec) => {
    const features = specFeatures.get(spec);
    if (!features || features.size === 0) {
      return true;
    }
    return [...features].some((module) => affected.has(module));
  });
}
