import type { Dashboard } from "metabase-types/api";

export const getDashboardId = (dashboard: Dashboard): number => {
  if (typeof dashboard.id === "string") {
    throw new Error("This dashboard has an invalid id");
  }
  const dashboardId: number = dashboard.id;
  return dashboardId;
};
