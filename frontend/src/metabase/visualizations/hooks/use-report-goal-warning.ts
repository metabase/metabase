import { useEffect } from "react";

import type { OnUpdateGoalWarning } from "metabase/visualizations/types";

export function useReportGoalWarning(
  hasGoalWarning: boolean,
  onUpdateGoalWarning: OnUpdateGoalWarning | undefined,
) {
  useEffect(() => {
    onUpdateGoalWarning?.(hasGoalWarning);

    // clear the warning when the chart unmounts, e.g. after a display switch
    return () => onUpdateGoalWarning?.(false);
  }, [hasGoalWarning, onUpdateGoalWarning]);
}
