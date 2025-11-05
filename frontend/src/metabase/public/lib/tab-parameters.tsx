import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard } from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

export function getTabHiddenParameterSlugs({
  parameters,
  dashboard,
  selectedTabId,
}: {
  parameters: UiParameter[];
  dashboard: Dashboard | null;
  selectedTabId: SelectedTabId;
}) {
  const currentTabParameterIds =
    getCurrentTabDashcards({ dashboard, selectedTabId })?.flatMap(
      (dashcard) =>
        dashcard.parameter_mappings?.map((mapping) => mapping.parameter_id) ??
        [],
    ) ?? [];
  const hiddenParameters = parameters.filter(
    (parameter) => !currentTabParameterIds.includes(parameter.id),
  );
  return hiddenParameters.map((parameter) => parameter.slug).join(",");
}

function getCurrentTabDashcards({
  dashboard,
  selectedTabId,
}: {
  dashboard: Dashboard | null;
  selectedTabId: SelectedTabId;
}) {
  if (!Array.isArray(dashboard?.dashcards)) {
    return [];
  }
  if (!selectedTabId) {
    return dashboard?.dashcards;
  }
  return dashboard?.dashcards.filter(
    (dashcard) => dashcard.dashboard_tab_id === selectedTabId,
  );
}
