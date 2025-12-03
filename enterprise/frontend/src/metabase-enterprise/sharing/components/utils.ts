import { hasInlineParameters } from "metabase/dashboard/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, DashboardCard } from "metabase-types/api";

export const getSortedParameters = (
  dashboard: Dashboard,
  parameters: UiParameter[],
) => {
  const inlineParameterIds = new Set<string>();
  const parameterToDashcard = new Map<string, DashboardCard>();

  dashboard.dashcards.forEach((dashcard) => {
    if (hasInlineParameters(dashcard)) {
      dashcard.inline_parameters.forEach((paramId) => {
        inlineParameterIds.add(paramId);
        parameterToDashcard.set(paramId, dashcard);
      });
    }
  });

  // Separate dashboard-level and inline parameters
  const dashboardLevelParams = parameters.filter(
    (p) => !inlineParameterIds.has(p.id),
  );
  const inlineParams = parameters.filter((p) => inlineParameterIds.has(p.id));

  // Sort inline parameters by dashcard position (row first, then col)
  const sortedInlineParams = inlineParams.sort((a, b) => {
    const dashcardA = parameterToDashcard.get(a.id);
    const dashcardB = parameterToDashcard.get(b.id);

    if (!dashcardA || !dashcardB) {
      return 0;
    }

    // Sort by row first
    if (dashcardA.row !== dashcardB.row) {
      return dashcardA.row - dashcardB.row;
    }
    // Then by column
    return dashcardA.col - dashcardB.col;
  });

  // Return dashboard-level parameters first, then sorted inline parameters
  return [...dashboardLevelParams, ...sortedInlineParams];
};
