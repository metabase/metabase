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

// A signal that forces a suite to run in full, in either selection mode.
export type ForceSignal =
  | "unit_infra"
  | "loki_infra"
  | "e2e_infra"
  | "shared_sources"
  | "backend_files"
  | "no_coverage_manifest";

// Why a suite's tests were selected. One variant per selectTestsToRun branch,
// so adding a branch without deciding its explanation does not compile.
// forcedBy lists every signal that fired, not just the first.
export type SuiteDecision =
  | { outcome: "forced-full"; forcedBy: [ForceSignal, ...ForceSignal[]] }
  | { outcome: "narrowed"; affectedModules: string[] }
  | { outcome: "gated-full" }
  | { outcome: "skipped" };

export type TestPlanDecisions = {
  version: 1;
  mode: TestSelectionMode;
  unit: SuiteDecision;
  loki: SuiteDecision;
  e2e: SuiteDecision;
};

export type TestPlan = {
  stats: TestPlanStats;
  decisions: TestPlanDecisions;
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
  const signals = (pairs: [ForceSignal, boolean][]): ForceSignal[] =>
    pairs.filter(([, fired]) => fired).map(([signal]) => signal);
  // cljc/cljs compile into the FE bundle, so they force a full run that module
  // selection can't narrow — same effect as a suite's own infra changing.
  const unitForceSignals = signals([
    ["unit_infra", unitInfraTouched],
    ["shared_sources", sharedSourcesTouched],
  ]);
  const lokiForceSignals = signals([
    ["loki_infra", lokiInfraTouched],
    ["shared_sources", sharedSourcesTouched],
  ]);
  // e2e is integration-level, so anything the FE-coverage manifest can't see
  // forces a full run: cljc/cljs in the bundle (shared_sources), a backend
  // change that can break the UI (backend_files), an e2e harness/support change
  // (e2e_infra), or no manifest at all.
  const e2eForceSignals = signals([
    ["shared_sources", sharedSourcesTouched],
    ["e2e_infra", e2eInfraTouched],
    ["backend_files", beFilesChanged > 0],
    ["no_coverage_manifest", e2eSpecFiles === null],
  ]);

  // Step 4: decide which of each suite's tests run, per graph.
  const { unit, loki, e2e } = testFilesBySuite;

  // Precompute spec -> feature modules once (null when e2e never narrows).
  const specFeatures =
    testSelectionMode === "COMPREHENSIVE" ||
    e2eForceSignals.length > 0 ||
    e2eSpecFiles === null
      ? null
      : specFeatureModules(nodes, featureModules, e2eSpecFiles);
  // A spec that was itself edited always runs, even when no app module changed.
  const changedSet = new Set(changedFiles);

  // Each returns the selected files plus the affected modules that explain
  // them, for the narrowed decision.
  type AffectedTests = { files: string[]; modules: string[] };
  const affectedSuite =
    (files: string[]) =>
    (affected: Set<string>): AffectedTests => {
      const selected = filterAffectedTests(nodes, affected, files);
      const modules = selected
        .map((file) => mapFileToModule(nodes, file))
        .filter((module): module is string => module !== null);
      return { files: selected, modules: [...new Set(modules)].sort() };
    };
  const affectedUnit = affectedSuite(unit);
  const affectedLoki = affectedSuite(loki);
  const affectedE2e = (affected: Set<string>): AffectedTests => {
    if (specFeatures === null) {
      return { files: e2e, modules: [] };
    }
    const narrowed = new Set(
      filterAffectedE2eSpecs(specFeatures, affected, e2e),
    );
    const files = e2e.filter(
      (spec) => narrowed.has(spec) || changedSet.has(spec),
    );
    const modules = new Set<string>();
    for (const spec of files) {
      for (const feature of specFeatures.get(spec) ?? []) {
        if (affected.has(feature)) {
          modules.add(feature);
        }
      }
    }
    return { files, modules: [...modules].sort() };
  };

  // Which of one suite's tests run, in order of precedence, with the decision
  // that explains it. A force signal wins in either mode,
  // and COMPREHENSIVE ignores the module graph on purpose,
  // so a graph mistake can never skip a suite at the last gate before master.
  const selectTestsToRun = (
    forceSignals: ForceSignal[],
    affected: Set<string>,
    files: string[],
    affectedTests: (affected: Set<string>) => AffectedTests,
  ): { files: string[]; decision: SuiteDecision } => {
    if (forceSignals.length > 0) {
      return {
        files,
        decision: {
          outcome: "forced-full",
          forcedBy: forceSignals as [ForceSignal, ...ForceSignal[]],
        },
      };
    }
    if (testSelectionMode === "SELECTIVE") {
      const { files: selected, modules } = affectedTests(affected);
      return {
        files: selected,
        decision: { outcome: "narrowed", affectedModules: modules },
      };
    }
    if (feFilesChanged > 0) {
      return { files, decision: { outcome: "gated-full" } };
    }
    return { files: [], decision: { outcome: "skipped" } };
  };

  const unitRules = selectTestsToRun(
    unitForceSignals,
    rulesAffected,
    unit,
    affectedUnit,
  ).files;
  const unitUsageRun = selectTestsToRun(
    unitForceSignals,
    usageAffected,
    unit,
    affectedUnit,
  );
  const lokiRules = selectTestsToRun(
    lokiForceSignals,
    rulesAffected,
    loki,
    affectedLoki,
  ).files;
  const lokiUsageRun = selectTestsToRun(
    lokiForceSignals,
    usageAffected,
    loki,
    affectedLoki,
  );
  const e2eRules = selectTestsToRun(
    e2eForceSignals,
    rulesAffected,
    e2e,
    affectedE2e,
  ).files;
  const e2eUsageRun = selectTestsToRun(
    e2eForceSignals,
    usageAffected,
    e2e,
    affectedE2e,
  );
  const unitUsage = unitUsageRun.files;
  const lokiUsage = lokiUsageRun.files;
  const e2eUsage = e2eUsageRun.files;

  // Step 5: emit the plan, its decisions, and its stats.
  // Decisions describe the usage-graph run - the lists that actually ship.
  return {
    decisions: {
      version: 1,
      mode: testSelectionMode,
      unit: unitUsageRun.decision,
      loki: lokiUsageRun.decision,
      e2e: e2eUsageRun.decision,
    },
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
