export const ALERT_TYPE_ROWS = "alert-type-rows";
export const ALERT_TYPE_TIMESERIES_GOAL = "alert-type-timeseries-goal";
export const ALERT_TYPE_PROGRESS_BAR_GOAL = "alert-type-progress-bar-goal";

export type AlertType =
  | ALERT_TYPE_ROWS
  | ALERT_TYPE_TIMESERIES_GOAL
  | ALERT_TYPE_PROGRESS_BAR_GOAL;

export const getDefaultAlert = (question, user, visualizationSettings) => {
  const alertType = question.alertType(visualizationSettings);

  const typeDependentAlertFields =
    alertType === ALERT_TYPE_ROWS
      ? { alert_condition: "rows", alert_first_only: false }
      : {
          alert_condition: "goal",
          alert_first_only: true,
          alert_above_goal: true,
        };

  const defaultEmailChannel = {
    enabled: true,
    channel_type: "email",
    recipients: [user],
    schedule_day: "mon",
    schedule_frame: null,
    schedule_hour: 0,
    schedule_type: "daily",
  };

  return {
    card: { id: question.id(), include_csv: false, include_xls: false },
    channels: [defaultEmailChannel],
    ...typeDependentAlertFields,
  };
};
