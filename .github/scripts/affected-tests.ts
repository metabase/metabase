// Builds the affected-tests plan from raw inputs: computes the rules and usage
// affected-module sets and selects, per suite, which specs to run under each.
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
  be_files_changed: number;
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

export type CreateTestPlanInput = {
  elements: ModuleDef[];
  rules: Rule[];
  changedFiles: string[];
  // Parsed dependency-cruiser edges, or null to fall back to the rules graph.
  fileDependencies: FileDependency[] | null;
  testFilesBySuite: { unit: string[]; loki: string[]; e2e: string[] };
  unitInfraTouched: boolean;
  lokiInfraTouched: boolean;
  sharedSourcesTouched: boolean;
  feFilesChanged: number;
  beFilesChanged: number;
};

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

export function createTestPlan({
  elements,
  rules,
  changedFiles,
  fileDependencies,
  testFilesBySuite,
  unitInfraTouched,
  lokiInfraTouched,
  sharedSourcesTouched,
  feFilesChanged,
  beFilesChanged,
}: CreateTestPlanInput): TestPlan {
  const rulesGraph = buildModuleGraph(elements, rules);
  const usageGraph = fileDependencies
    ? buildUsageModuleGraph(elements, fileDependencies)
    : rulesGraph;

  const nodes = rulesGraph.nodes;
  const changedModules = getChangedModules(nodes, changedFiles);
  const rulesAffected = getAffectedModules(rulesGraph, changedFiles);
  const usageAffected = getAffectedModules(usageGraph, changedFiles);

  // cljc/cljs compile into the FE bundle, so they force a full run that module
  // selection can't narrow — same effect as a suite's own infra changing.
  const unitForceAll = unitInfraTouched || sharedSourcesTouched;
  const lokiForceAll = lokiInfraTouched || sharedSourcesTouched;

  const select = (forceAll: boolean, affected: Set<string>, files: string[]) =>
    forceAll ? files : filterAffectedTests(nodes, affected, files);

  const { unit, loki, e2e } = testFilesBySuite;
  const unitRules = select(unitForceAll, rulesAffected, unit);
  const unitUsage = select(unitForceAll, usageAffected, unit);
  const lokiRules = select(lokiForceAll, rulesAffected, loki);
  const lokiUsage = select(lokiForceAll, usageAffected, loki);
  // No e2e-spec -> module mapping exists yet, so e2e always runs in full.
  const e2eRules = e2e;
  const e2eUsage = e2e;

  return {
    stats: {
      fe_files_changed: feFilesChanged,
      be_files_changed: beFilesChanged,
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
