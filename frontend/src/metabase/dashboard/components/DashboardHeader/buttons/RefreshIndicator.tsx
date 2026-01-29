import { useEffect, useState } from "react";

import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";

import { RefreshWidgetTarget } from "../../RefreshWidget/RefreshWidgetTarget";

/**
 * This is only used in modular embeddings
 */
export function RefreshIndicator() {
  const { refreshPeriod, setRefreshElapsedHook } = useDashboardContext();
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    setRefreshElapsedHook(setElapsed);
  }, [setRefreshElapsedHook]);

  if (refreshPeriod == null || refreshPeriod <= 0) {
    return null;
  }
  return (
    <RefreshWidgetTarget
      elapsed={elapsed}
      period={refreshPeriod}
      className={CS.cursorDefault}
    />
  );
}
