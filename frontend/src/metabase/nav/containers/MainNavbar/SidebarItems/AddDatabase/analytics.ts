import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackAddDatabaseSidebar = () => {
  trackSimpleEvent({
    event: "database_add_clicked",
    triggered_from: "left-nav",
  });
};
