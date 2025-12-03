import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackHelpButtonClick = () => {
  trackSimpleEvent({
    event: "database_help_clicked",
    triggered_from: "admin",
  });
};
