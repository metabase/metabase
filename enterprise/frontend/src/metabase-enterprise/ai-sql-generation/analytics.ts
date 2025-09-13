import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetabotSqlClicked = () => {
  trackSimpleEvent({
    event: "metabot_sql_clicked",
  });
};
