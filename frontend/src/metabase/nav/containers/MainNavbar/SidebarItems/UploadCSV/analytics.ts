import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackButtonClicked = () => {
  trackSimpleEvent({
    event: "csv_upload_clicked",
    triggered_from: "left_nav",
  });
};
