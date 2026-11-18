import { useEffect, useRef } from "react";

import { useSelector } from "metabase/redux";
import type { DashboardId } from "metabase-types/api";

import { getDashboardSaveId } from "../state/selectors";

/**
 * Calls `onSave` each time Metabot saves the dashboard with `dashboardId`.
 * Saves made before the component showed this dashboard are ignored, since it loads the dashboard then anyway.
 */
export const useOnMetabotDashboardSave = (
  dashboardId: DashboardId | undefined,
  onSave: () => void,
) => {
  const saveId = useSelector((state) =>
    dashboardId === undefined
      ? undefined
      : getDashboardSaveId(state, dashboardId),
  );
  const seen = useRef({ dashboardId, saveId });

  useEffect(() => {
    const previous = seen.current;
    seen.current = { dashboardId, saveId };
    if (
      previous.dashboardId === dashboardId &&
      saveId !== undefined &&
      saveId !== previous.saveId
    ) {
      onSave();
    }
  }, [dashboardId, saveId, onSave]);
};
