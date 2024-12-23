import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/v1/Alert";
import type Question from "metabase-lib/v1/Question";
import type { Alert, VisualizationSettings } from "metabase-types/api";

export const hasProperGoalForAlert = ({
  question,
  visualizationSettings,
}: {
  question: Question | undefined;
  visualizationSettings: VisualizationSettings;
}): boolean => {
  const alertType = question?.alertType(visualizationSettings);

  if (!alertType) {
    return false;
  }

  return (
    alertType === ALERT_TYPE_TIMESERIES_GOAL ||
    alertType === ALERT_TYPE_PROGRESS_BAR_GOAL
  );
};

export const isAlert = (_: Alert) => true;

export const isSubscription = (_: Alert) => false;
