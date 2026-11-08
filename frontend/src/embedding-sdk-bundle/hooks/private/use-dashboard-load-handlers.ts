import { useCallback, useEffect, useRef } from "react";

import { recordPhase } from "embedding-sdk-bundle/analytics/phase-timestamps";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useSelector } from "metabase/redux";
import type { Dashboard } from "metabase-types/api";

import { getEventHandlers } from "../../store/selectors";

export const useDashboardLoadHandlers = ({
  onLoad,
  onLoadWithoutCards,
}: PublicOrEmbeddedDashboardEventHandlersProps) => {
  const sdkEventHandlers = useSelector(getEventHandlers);
  // Hack: since we're storing functions in the redux store there are issues
  // with timing and serialization. We'll need to do something about this in the future
  const sdkEventHandlersRef = useRef(sdkEventHandlers);

  useEffect(() => {
    sdkEventHandlersRef.current = sdkEventHandlers;
  }, [sdkEventHandlers]);

  // Use the ref in your callbacks
  const handleLoadWithoutCards = useCallback(
    (dashboard: Dashboard) => {
      recordPhase("metadata_ready");
      // Card queries dispatch in the same React commit cycle as this callback,
      // so recording query_start here is sub-millisecond from the real dispatch.
      // The actual dispatch lives in shared dashboard code where we cannot import
      // SDK analytics without bleeding into the main app.
      recordPhase("query_start");
      onLoadWithoutCards?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoadWithoutCards?.(dashboard);
    },
    [onLoadWithoutCards],
  );

  const handleLoad = useCallback(
    (dashboard: Dashboard) => {
      recordPhase("query_end");
      onLoad?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoad?.(dashboard);
    },
    [onLoad],
  );

  return {
    handleLoad,
    handleLoadWithoutCards,
  };
};
