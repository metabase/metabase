export const ALERT_TYPE_ROWS = "alert-type-rows";
export const ALERT_TYPE_TIMESERIES_GOAL = "alert-type-timeseries-goal";
export const ALERT_TYPE_PROGRESS_BAR_GOAL = "alert-type-progress-bar-goal";

const AlertTypes = [
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  ALERT_TYPE_PROGRESS_BAR_GOAL,
] as const;

export type NotificationTriggerType = (typeof AlertTypes)[number];
