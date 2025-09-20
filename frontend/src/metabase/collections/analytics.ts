import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackDataReferenceClicked = () => {
  trackSimpleEvent({
    event: "learn_about_our_data_clicked",
  });
};
