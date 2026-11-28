// A unit spec's name is a co-location claim: Foo.bar.unit.spec.tsx promises that Foo.bar or Foo
// is a source file (or an index directory) beside it, and a spec in a test/ or tests/ directory
// claims the directory the test directory sits in.
// Without a flag it exits 1 when the tree drifts from KNOWN_ORPHANED_SPECS, and `--list` prints every finding.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../..");

const SPEC_ROOTS = [
  "frontend/src",
  "frontend/lint",
  "frontend/build",
  "enterprise/frontend/src",
];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_DIR_NAMES = new Set(["test", "tests"]);
const SPEC_NAME = /^(.*)\.unit\.spec\.(?:js|jsx|ts|tsx)$/;

// Pre-existing misnames recorded so the scan starts green: every entry is a spec whose name
// claims a subject that is not there, kept only until it is moved with its code or renamed
// into a test directory. The list must only shrink — a new orphan fails even if added here,
// because reviewers see the addition, and a fixed one fails until its entry is deleted.
const KNOWN_ORPHANED_SPECS = [
  "enterprise/frontend/src/embedding-sdk-package/cli/utils/permissions-graph.unit.spec.ts",
  "enterprise/frontend/src/metabase-enterprise/browse/models/BrowseModels.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/caching/components/StrategyEditorForDatabases.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/custom_viz/custom-viz-drill.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/custom_viz/custom-viz-unsaved-reload.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/custom_viz/load-custom-viz-plugin-for-display.unit.spec.ts",
  "enterprise/frontend/src/metabase-enterprise/data_apps/runtime/lib/use-host-sdk-store-auth.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/lazy-plugin-route-slots.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/lazy-plugin-routes.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/metabot/components/MetabotAdmin/AIProviderListUsage.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/DataComplexityHeader.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/DataComplexitySection.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/query-snapshots.unit.spec.ts",
  "enterprise/frontend/src/metabase-enterprise/storage/AddDataModalPanels.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/storage/CSVPanel.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/upload_management/UploadManagement.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/analytics/events.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/private/SdkUsageProblem/SdkUsageProblemDisplay-simple-embedding.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/private/SdkUsageProblem/SdkUsageProblemDisplay.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion-drills.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion-multiple-questions.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/public/dashboard/EditableDashboard/enterprise.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/components/public/dashboard/EditableDashboard/premium.unit.spec.tsx",
  "frontend/src/embedding-sdk-bundle/lib/theme/embedding-color-palette.unit.spec.ts",
  "frontend/src/embedding-sdk-bundle/lib/transform-question.unit.spec.ts",
  "frontend/src/metabase/collections/components/CollectionContent/CollectionContentPinnedItems.unit.spec.tsx",
  "frontend/src/metabase/collections/components/CollectionContent/CollectionContentSelection.unit.spec.tsx",
  "frontend/src/metabase/collections/components/CollectionContent/CollectionContentShortcuts.unit.spec.tsx",
  "frontend/src/metabase/collections/components/CollectionContent/CollectionContentUpload.unit.spec.tsx",
  "frontend/src/metabase/common/collections/components/CompactPinnedItemCard/CompactPinnedItemCard-ee.unit.spec.tsx",
  "frontend/src/metabase/common/components/TitleAndDescription/i18n-tests/common.unit.spec.tsx",
  "frontend/src/metabase/common/components/TitleAndDescription/i18n-tests/premium.unit.spec.tsx",
  "frontend/src/metabase/dashboard/components/DashboardChartSettings/ChartNestedSettingSeriesMultiple.unit.spec.tsx",
  "frontend/src/metabase/embedding-sdk/theme/apply-color-operation.unit.spec.ts",
  "frontend/src/metabase/new/components/NewModals/NewItemMenu.unit.spec.tsx",
  "frontend/src/metabase/parameters/components/ParameterWidget/i18n-tests/common.unit.spec.tsx",
  "frontend/src/metabase/parameters/components/ParameterWidget/i18n-tests/premium.unit.spec.tsx",
  "frontend/src/metabase/query_builder/components/QueryVisualization.unit.spec.tsx",
  "frontend/src/metabase/query_builder/components/QuestionDownloadWidget/QuestionDownloadWidget.unit.spec.tsx",
  "frontend/src/metabase/query_builder/components/Warnings.unit.spec.tsx",
  "frontend/src/metabase/querying/components/ResponsiveParameterList.unit.spec.tsx",
  "frontend/src/metabase/querying/components/expressions/HighlightExpression/util.unit.spec.ts",
  "frontend/src/metabase/router/Navigate.unit.spec.tsx",
  "frontend/src/metabase/router/Outlet.unit.spec.tsx",
  "frontend/src/metabase/router/lazy-route.unit.spec.tsx",
  "frontend/src/metabase/router/navigate-contract.unit.spec.tsx",
  "frontend/src/metabase/router/prefetch-on-visible.unit.spec.ts",
  "frontend/src/metabase/router/route-leave-scope.unit.spec.tsx",
  "frontend/src/metabase/router/route.unit.spec.tsx",
  "frontend/src/metabase/router/router-engine.unit.spec.tsx",
  "frontend/src/metabase/router/router-listen.unit.spec.tsx",
  "frontend/src/metabase/router/use-location.unit.spec.tsx",
  "frontend/src/metabase/router/use-params.unit.spec.tsx",
  "frontend/src/metabase/router/use-search-params.unit.spec.tsx",
  "frontend/src/metabase/selectors/selectors.unit.spec.ts",
  "frontend/src/metabase/settings/settings-cache.unit.spec.tsx",
  "frontend/src/metabase/static-viz/lib/truncate-text.unit.spec.ts",
  "frontend/src/metabase/transforms/pages/TransformSettingsPage/TransformSettingsSection/TargetSection.unit.spec.tsx",
  "frontend/src/metabase/ui/colors/constants/themes/themes.unit.spec.ts",
  "frontend/src/metabase/utils/formatting/round-float.unit.spec.ts",
  "frontend/src/metabase/visualizations/components/Visualization/Visualization-loading.unit.spec.tsx",
  "frontend/src/metabase/visualizations/components/Visualization/Visualization-object.unit.spec.tsx",
  "frontend/src/metabase/visualizations/components/Visualization/Visualization-themed.unit.spec.tsx",
  "frontend/src/metabase/visualizations/components/settings/ChartSettingStacked.unit.spec.tsx",
];

function listSpecFiles() {
  return SPEC_ROOTS.flatMap((root) =>
    fs
      .readdirSync(path.join(REPO_ROOT, root), {
        recursive: true,
        withFileTypes: true,
      })
      .filter((entry) => entry.isFile() && SPEC_NAME.test(entry.name))
      .map((entry) =>
        path
          .relative(REPO_ROOT, path.join(entry.parentPath, entry.name))
          .replaceAll("\\", "/"),
      ),
  ).sort();
}

function isSourceFile(name) {
  return (
    SOURCE_EXTENSIONS.includes(path.extname(name)) &&
    !name.includes(".unit.spec.") &&
    !name.includes(".stories.")
  );
}

// A spec's base name can carry facet suffixes (QueryBuilder.timeline-events names QueryBuilder),
// so every dot-separated prefix of the base is a candidate subject name.
function candidateNames(base) {
  const candidates = [base];
  let prefix = base;
  while (prefix.includes(".")) {
    prefix = prefix.slice(0, prefix.lastIndexOf("."));
    candidates.push(prefix);
  }
  return candidates;
}

function subjectExists(dir, base) {
  return candidateNames(base).some((name) =>
    SOURCE_EXTENSIONS.some(
      (ext) =>
        fs.existsSync(path.join(REPO_ROOT, dir, `${name}${ext}`)) ||
        fs.existsSync(path.join(REPO_ROOT, dir, name, `index${ext}`)) ||
        (name === path.basename(dir) &&
          fs.existsSync(path.join(REPO_ROOT, dir, `index${ext}`))),
    ),
  );
}

function dirHasSource(dir) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(REPO_ROOT, dir), {
      withFileTypes: true,
    });
  } catch {
    return false;
  }
  return entries.some((entry) => {
    if (entry.isFile()) {
      return isSourceFile(entry.name);
    }
    return (
      entry.isDirectory() &&
      !TEST_DIR_NAMES.has(entry.name) &&
      dirHasSource(path.join(dir, entry.name))
    );
  });
}

function findOrphanedSpecs() {
  const findings = [];
  for (const spec of listSpecFiles()) {
    const segments = spec.split("/");
    const testIndex = segments.findLastIndex((segment) =>
      TEST_DIR_NAMES.has(segment),
    );
    if (testIndex !== -1) {
      const subjectDir = segments.slice(0, testIndex).join("/");
      if (!dirHasSource(subjectDir)) {
        findings.push({ spec, kind: "empty-subject", subjectDir });
      }
      continue;
    }
    const dir = segments.slice(0, -1).join("/");
    const base = SPEC_NAME.exec(segments.at(-1))[1];
    if (!subjectExists(dir, base)) {
      findings.push({ spec, kind: "missing-subject", dir, base });
    }
  }
  return findings;
}

function formatFinding(finding) {
  if (finding.kind === "empty-subject") {
    return [
      finding.spec,
      `  sits in a test directory, but ${finding.subjectDir} has no source files to be the subject.`,
      "  Move the spec to the directory of the code it tests.",
    ].join("\n");
  }
  return [
    finding.spec,
    `  names a subject that is not beside it: no ${finding.base}.{ts,tsx,js,jsx} (or ${finding.base}/index.*) in ${finding.dir}.`,
    "  Either move the spec to its subject's directory and name it after the subject file,",
    "  or give it a behaviour name and put it in a tests/ directory here.",
  ].join("\n");
}

function diffKnown(findings) {
  const found = new Set(findings.map((finding) => finding.spec));
  const known = new Set(KNOWN_ORPHANED_SPECS);
  return {
    unlisted: findings.filter((finding) => !known.has(finding.spec)),
    fixed: KNOWN_ORPHANED_SPECS.filter((spec) => !found.has(spec)),
  };
}

/* eslint-disable no-console */
function main(argv) {
  const findings = findOrphanedSpecs();
  console.log(
    `${findings.length} orphaned specs out of ${listSpecFiles().length}`,
  );
  if (argv.includes("--list")) {
    for (const finding of findings) {
      console.log(formatFinding(finding));
    }
    return 0;
  }
  const { unlisted, fixed } = diffKnown(findings);
  for (const finding of unlisted) {
    console.log(formatFinding(finding));
  }
  for (const spec of fixed) {
    console.log(
      `${spec}\n  is no longer orphaned: delete its entry from KNOWN_ORPHANED_SPECS.`,
    );
  }
  return unlisted.length + fixed.length > 0 ? 1 : 0;
}

module.exports = {
  KNOWN_ORPHANED_SPECS,
  diffKnown,
  findOrphanedSpecs,
  formatFinding,
  listSpecFiles,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
