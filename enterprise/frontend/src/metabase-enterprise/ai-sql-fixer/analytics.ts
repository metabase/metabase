import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackQueryFixClicked = () => {
  trackSimpleEvent({
    event: "metabot_fix_query_clicked",
  });
};
