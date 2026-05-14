import { trackSchemaEvent } from "metabase/analytics";

export const trackCustomHomepageDashboardEnabled = (
  source: "admin" | "homepage",
) => {
  trackSchemaEvent("settings", {
    event: "homepage_dashboard_enabled",
    source,
  });
};
