import { t } from "ttag";

import { AlertSettingToggle } from "metabase/query_builder/components/AlertModals/AlertSettingToggle";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/v1/Alert";
import type { AlertType } from "metabase-lib/v1/Alert/types";
import type { Alert } from "metabase-types/api";

type AlertGoalTogglesProps = {
  alertType: AlertType;
  alert: Alert;
  onAlertChange: (alert: Alert) => void;
};

export const AlertGoalToggles = ({
  alertType,
  alert,
  onAlertChange,
}: AlertGoalTogglesProps) => {
  const isTimeseries = alertType === ALERT_TYPE_TIMESERIES_GOAL;
  const isProgress = alertType === ALERT_TYPE_PROGRESS_BAR_GOAL;

  if (!isTimeseries && !isProgress) {
    // not a goal alert
    return null;
  }

  return (
    <div>
      <AlertSettingToggle
        setting="alert_above_goal"
        alert={alert}
        onAlertChange={onAlertChange}
        title={
          isTimeseries
            ? t`Alert me when the line…`
            : t`Alert me when the progress bar…`
        }
        trueText={isTimeseries ? t`Reaches the goal line` : t`Reaches the goal`}
        falseText={
          isTimeseries ? t`Goes below the goal line` : t`Goes below the goal`
        }
      />
      <AlertSettingToggle
        setting="alert_first_only"
        alert={alert}
        onAlertChange={onAlertChange}
        title={
          isTimeseries
            ? t`The first time it crosses, or every time?`
            : t`The first time it reaches the goal, or every time?`
        }
        trueText={t`The first time`}
        falseText={t`Every time`}
      />
    </div>
  );
};
