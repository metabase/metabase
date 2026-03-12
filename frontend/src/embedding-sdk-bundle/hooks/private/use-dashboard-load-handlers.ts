import { useCallback, useEffect, useRef } from "react";

import { useSelector } from "metabase/lib/redux";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
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
      onLoadWithoutCards?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoadWithoutCards?.(dashboard);
    },
    [onLoadWithoutCards],
  );

  const handleLoad = useCallback(
    (dashboard: Dashboard) => {
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
