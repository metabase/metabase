// Re-export from canonical location in metabase/lib
// TODO: update all consumers to import from "metabase/lib/alert-constants" directly
// eslint-disable-next-line no-restricted-imports -- re-export stub during migration
export {
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  type NotificationTriggerType,
} from "metabase/lib/alert-constants";
