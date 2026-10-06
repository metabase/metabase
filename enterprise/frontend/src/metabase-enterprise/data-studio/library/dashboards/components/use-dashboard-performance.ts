import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { cardApi } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Dashboard } from "metabase-types/api";

/**
 * Estimates how long the dashboard takes to load, in seconds: its cards run in
 * parallel, so that's the slowest card's average query time. Dashcards don't
 * include query times, so each card is fetched (GET /api/card/:id hydrates it).
 * Returns null when no card has run yet, and undefined while loading.
 */
export function useAverageLoadingTime(dashboard: Dashboard) {
  const dispatch = useDispatch();
  const [loadingTime, setLoadingTime] = useState<number | null>();

  const cardIds = useMemo(
    () =>
      _.uniq(
        dashboard.dashcards
          .filter(isQuestionDashCard)
          .map((dashcard) => dashcard.card.id),
      ),
    [dashboard.dashcards],
  );

  useEffect(() => {
    let isCancelled = false;
    setLoadingTime(undefined);

    Promise.all(
      cardIds.map((id) =>
        dispatch(
          cardApi.endpoints.getCard.initiate({ id }, { subscribe: false }),
        )
          .unwrap()
          .then((card) => card.average_query_time)
          .catch(() => null),
      ),
    ).then((queryTimes) => {
      if (isCancelled) {
        return;
      }
      const knownTimes = queryTimes.filter(
        (time): time is number => time != null,
      );
      setLoadingTime(
        knownTimes.length > 0 ? Math.max(...knownTimes) / 1000 : null,
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [dispatch, cardIds]);

  return loadingTime;
}

const DASHBOARD_CACHE_MODELS = ["dashboard" as const];

/** The dashboard's caching policy, labeled like the dashboard settings sidebar. */
export function useCachingLabel(dashboard: Dashboard) {
  // library dashboards always have numeric ids (only x-rays use strings)
  const dashboardId = typeof dashboard.id === "number" ? dashboard.id : -1;
  const { configs, isLoading, error } = useCacheConfigs({
    model: DASHBOARD_CACHE_MODELS,
    id: dashboardId,
  });

  if (isLoading || error) {
    return undefined;
  }

  const config = configs?.find(
    ({ model, model_id }) => model === "dashboard" && model_id === dashboardId,
  );
  return getShortStrategyLabel(config?.strategy, "dashboard") ?? t`Default`;
}
