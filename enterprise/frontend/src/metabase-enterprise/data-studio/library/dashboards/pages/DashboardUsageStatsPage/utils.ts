import { isQuestionDashCard } from "metabase/utils/dashboard";
import {
  getDefaultValuePopulatedParameters,
  normalizeParameters,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Dashboard,
  DashboardId,
  NormalizedQueryParameter,
  Parameter,
  ParameterValuesMap,
  QuestionDashboardCard,
} from "metabase-types/api";

import {
  DASHBOARD_ID_PARAMETER_SLUG,
  USAGE_STATS_CARD_ENTITY_IDS,
} from "./constants";

export function getUsageStatsDashcards(
  auditDashboard: Pick<Dashboard, "dashcards">,
): QuestionDashboardCard[] {
  const questionDashcards = auditDashboard.dashcards.filter(isQuestionDashCard);

  return USAGE_STATS_CARD_ENTITY_IDS.flatMap((entityId) => {
    const dashcard = questionDashcards.find(
      ({ card }) => card.entity_id === entityId,
    );
    return dashcard ? [dashcard] : [];
  });
}

export function getDashboardIdParameter(
  auditDashboard: Pick<Dashboard, "parameters">,
): Parameter | undefined {
  return auditDashboard.parameters?.find(
    (parameter) => parameter.slug === DASHBOARD_ID_PARAMETER_SLUG,
  );
}

/**
 * Returns the audit dashboard parameters to send with each usage stats card query: every parameter with a shipped
 * default, set to that default, plus the dashboard id filter set to `dashboardId`. The backend ignores dashboard
 * parameter defaults for a dashcard query, so they must be sent as values.
 */
export function getUsageStatsParameters(
  auditDashboard: Pick<Dashboard, "parameters">,
  dashboardId: DashboardId,
): NormalizedQueryParameter[] {
  const dashboardIdParameter = getDashboardIdParameter(auditDashboard);
  const parameterValues: ParameterValuesMap =
    dashboardIdParameter != null
      ? { [dashboardIdParameter.id]: [dashboardId] }
      : {};
  const parametersWithValues = getDefaultValuePopulatedParameters(
    auditDashboard.parameters ?? [],
    parameterValues,
  ).filter((parameter) => parameter.value != null);

  return normalizeParameters(parametersWithValues);
}
