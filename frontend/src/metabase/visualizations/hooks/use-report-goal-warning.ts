import { useEffect } from "react";

import type { OnUpdateGoalWarning } from "metabase/visualizations/types";

export function useReportGoalWarning(
  hasGoalWarning: boolean,
  onUpdateGoalWarning: OnUpdateGoalWarning | undefined,
) {
  useEffect(() => {
    onUpdateGoalWarning?.(hasGoalWarning);

    // an unmounted chart, e.g. after switching the display, warns no more
    return () => onUpdateGoalWarning?.(false);
  }, [hasGoalWarning, onUpdateGoalWarning]);
}
