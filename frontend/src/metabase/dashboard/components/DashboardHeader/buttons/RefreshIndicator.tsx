import { useDashboardContext } from "metabase/dashboard/context";

export function RefreshIndicator() {
  const { refreshPeriod } = useDashboardContext();
  if (refreshPeriod == null || refreshPeriod <= 0) {
    return null;
  }
  return "refresh indicator";
}
