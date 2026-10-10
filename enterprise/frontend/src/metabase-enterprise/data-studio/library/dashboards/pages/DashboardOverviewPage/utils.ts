import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Dashboard } from "metabase-types/api";

/** Dashcards query in parallel, so the dashboard loads as slowly as its slowest query */
export function getLoadingTimeMs(
  dashboard: Pick<Dashboard, "dashcards">,
): number | null {
  const durations = dashboard.dashcards
    .filter(isQuestionDashCard)
    .flatMap((dashcard) => [dashcard.card, ...(dashcard.series ?? [])])
    .map((card) => card.query_average_duration)
    .filter((duration): duration is number => duration != null);

  return durations.length > 0 ? Math.max(...durations) : null;
}
