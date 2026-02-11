import type { TriggeredAlert } from "metabase-lib/transforms-inspector";

export const getMaxSeverity = (
  alerts: TriggeredAlert[],
): TriggeredAlert["severity"] => {
  if (alerts.some((a) => a.severity === "error")) {
    return "error";
  }
  if (alerts.some((a) => a.severity === "warning")) {
    return "warning";
  }
  return "info";
};
