import { useCallback, useEffect, useRef } from "react";

import { useSdkComponentPerformance } from "embedding-sdk-bundle/analytics/sdk-first-component-performance/react";
import { useSdkStore } from "embedding-sdk-bundle/store";
import { getDashcardDataMap } from "metabase/dashboard/selectors";
import { getDashcardResultsError } from "metabase/dashboard/utils";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useSelector } from "metabase/redux";
import { isNotNull } from "metabase/utils/types";
import type { DashCardDataMap, Dashboard } from "metabase-types/api";

import { getEventHandlers } from "../../store/selectors";

// The same check that DashCard uses to show a card error
const hasCardWithError = (dashcardDataMap: DashCardDataMap) =>
  Object.values(dashcardDataMap).some((datasetsByCardId) => {
    const datasets = Object.values(datasetsByCardId).filter(isNotNull);
    // The guest flag changes only the error message, not whether there is an error
    return getDashcardResultsError(datasets, false) !== undefined;
  });

export const useDashboardLoadHandlers = ({
  onLoad,
  onLoadWithoutCards,
}: PublicOrEmbeddedDashboardEventHandlersProps) => {
  const sdkEventHandlers = useSelector(getEventHandlers);
  // Hack: since we're storing functions in the redux store there are issues
  // with timing and serialization. We'll need to do something about this in the future
  const sdkEventHandlersRef = useRef(sdkEventHandlers);
  const componentPerformance = useSdkComponentPerformance();
  const store = useSdkStore();

  useEffect(() => {
    sdkEventHandlersRef.current = sdkEventHandlers;
  }, [sdkEventHandlers]);

  // Use the ref in your callbacks
  const handleLoadWithoutCards = useCallback(
    (dashboard: Dashboard) => {
      componentPerformance?.recordMark("metadata_end");
      componentPerformance?.recordMark("query_start");
      onLoadWithoutCards?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoadWithoutCards?.(dashboard);
    },
    [onLoadWithoutCards, componentPerformance],
  );

  const handleLoad = useCallback(
    (dashboard: Dashboard) => {
      onLoad?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoad?.(dashboard);
    },
    [onLoad],
  );

  const handleLoadingComplete = useCallback(() => {
    componentPerformance?.recordMark("query_end");
    componentPerformance?.finish({
      result: "success",
      // A failed card still leaves the rest of the dashboard on screen
      error: hasCardWithError(getDashcardDataMap(store.getState()))
        ? "card_query"
        : undefined,
    });
  }, [componentPerformance, store]);

  return {
    handleLoad,
    handleLoadWithoutCards,
    handleLoadingComplete,
  };
};
