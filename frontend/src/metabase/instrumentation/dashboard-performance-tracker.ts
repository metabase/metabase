import { useEffect } from "react";
import { createPerformanceTracker } from "./performance-tracker";

export type DashboardPerformanceEvent =
  | "app-init"
  | "dashcards-data-loaded"
  | "dashboard-rendered"
  | "dashcard-rendered";

export const dashboardPerformanceTracker = createPerformanceTracker(
  10000,
  events => {
    console.log(">>>events", events);
    const event = new CustomEvent("dashboard-idle", { detail: events });
    document.dispatchEvent(event); // TODO: catch in cypress
  },
);

export const useTrackDashboardRenderEvent = (
  name: DashboardPerformanceEvent,
) => {
  useEffect(() => {
    dashboardPerformanceTracker.trackEvent(name);
  });
};
