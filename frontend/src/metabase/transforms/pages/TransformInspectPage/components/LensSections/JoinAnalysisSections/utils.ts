import type { InspectorAlertTrigger } from "metabase-types/api";

export const getMaxSeverity = (
  alerts: InspectorAlertTrigger[],
): InspectorAlertTrigger["severity"] => {
  if (alerts.some((a) => a.severity === "error")) {
    return "error";
  }
  if (alerts.some((a) => a.severity === "warning")) {
    return "warning";
  }
  return "info";
};
