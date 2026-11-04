import type { Dashboard } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/dashboard";

import { getDashcardCards } from "../../utils";

/** Dashcards query in parallel, so the dashboard loads as slowly as its slowest query */
export function getLoadingTimeMs(
  dashboard: Pick<Dashboard, "dashcards">,
): number | null {
  const durations = getDashcardCards(dashboard)
    .filter(isReadableCard)
    .map((card) => card.query_average_duration)
    .filter((duration) => duration != null);

  return durations.length > 0 ? Math.max(...durations) : null;
}
