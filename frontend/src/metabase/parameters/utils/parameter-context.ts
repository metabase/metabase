import { hasInlineParameters } from "metabase/dashboard/utils";
import type { DashboardCard, Parameter, ParameterId } from "metabase-types/api";

/**
 * Determines if a parameter belongs to a specific dashcard (inline parameter)
 */
export function isParameterInDashcard(
  parameterId: ParameterId,
  dashcard: DashboardCard,
): boolean {
  return (
    hasInlineParameters(dashcard) &&
    dashcard.inline_parameters.includes(parameterId)
  );
}

/**
 * Determines if a parameter is a dashboard-level parameter (not inline)
 */
export function isDashboardLevelParameter(
  parameterId: ParameterId,
  dashcards: DashboardCard[],
): boolean {
  return !dashcards.some((dc) => isParameterInDashcard(parameterId, dc));
}

/**
 * Gets parameters that exist in the same context as the target
 * For inline parameters: returns parameters in the same dashcard
 * For dashboard-level parameters: returns other dashboard-level parameters
 */
export function getParametersInSameContext(
  parameters: Parameter[],
  targetDashcard: DashboardCard | null | undefined,
  allDashcards: DashboardCard[],
): Parameter[] {
  if (targetDashcard) {
    // For inline parameters, only return parameters in the same dashcard
    return parameters.filter((p) =>
      isParameterInDashcard(p.id, targetDashcard),
    );
  }

  // For dashboard-level parameters, only return other dashboard-level parameters
  return parameters.filter((p) =>
    isDashboardLevelParameter(p.id, allDashcards),
  );
}

/**
 * Generates a URL-safe slug for a parameter, considering its context
 * Inline parameters get a dashcard-specific suffix
 */
export function getParameterUrlSlug(
  parameter: Parameter,
  dashcard: DashboardCard | null | undefined,
): string {
  return dashcard ? `${parameter.slug}-${dashcard.id}` : parameter.slug;
}
