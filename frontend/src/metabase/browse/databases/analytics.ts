import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackAddDatabaseDBList = () => {
  trackSimpleEvent({
    event: "database_add_clicked",
    triggered_from: "db-list",
  });
};
