import { trackSimpleEvent } from "metabase/analytics";

export const trackAddDatabaseDBList = () => {
  trackSimpleEvent({
    event: "database_add_clicked",
    triggered_from: "db-list",
  });
};
