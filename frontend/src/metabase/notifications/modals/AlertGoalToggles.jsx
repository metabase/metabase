/* eslint-disable react/prop-types */
import { t } from "ttag";

import { ALERT_TYPE_TIMESERIES_GOAL } from "metabase-lib/v1/Alert";

import { AlertAboveGoalToggle } from "./AlertAboveGoalToggle";
import { AlertFirstOnlyToggle } from "./AlertFirstOnlyToggle";

export const AlertGoalToggles = ({ alertType, alert, onAlertChange }) => {
  // alertType can be only ALERT_TYPE_TIMESERIES_GOAL or ALERT_TYPE_PROGRESS_BAR_GOAL
  const isTimeseries = alertType === ALERT_TYPE_TIMESERIES_GOAL;

  return (
    <div>
      <AlertAboveGoalToggle
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
      <AlertFirstOnlyToggle
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
