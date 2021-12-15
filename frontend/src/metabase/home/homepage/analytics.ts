import { trackStructEvent } from "metabase/lib/analytics";
import { Database, Dashboard } from "./types";

export const trackCollectionClick = () => {
  trackStructEvent("Homepage", "Browse Items Clicked");
};

export const trackDatabaseClick = (database: Database) => {
  trackStructEvent(
    "Homepage",
    "Browse DB Clicked",
    `DB Type ${database.engine}`,
  );
};

export const trackDashboardClick = (dashboard: Dashboard) => {
  trackStructEvent(
    "Homepage",
    "Pinned Item Click",
    `Pin Type ${dashboard.model}`,
  );
};
