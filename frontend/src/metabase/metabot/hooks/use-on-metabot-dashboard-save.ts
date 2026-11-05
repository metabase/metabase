import { useEffect, useRef } from "react";

import { useSelector } from "metabase/redux";
import type { DashboardId } from "metabase-types/api";

import { getSavedDashboard } from "../state/selectors";

/**
 * Calls `onSave` each time Metabot saves the dashboard with `dashboardId`.
 * Saves made before the calling component mounted are ignored, since a page that mounts afterwards
 * loads the saved dashboard anyway.
 */
export const useOnMetabotDashboardSave = (
  dashboardId: DashboardId | undefined,
  onSave: () => void,
) => {
  const savedDashboard = useSelector(getSavedDashboard);
  const handledSaveId = useRef(savedDashboard?.saveId);

  useEffect(() => {
    if (!savedDashboard || savedDashboard.saveId === handledSaveId.current) {
      return;
    }
    handledSaveId.current = savedDashboard.saveId;
    if (savedDashboard.dashboardId === dashboardId) {
      onSave();
    }
  }, [savedDashboard, dashboardId, onSave]);
};
