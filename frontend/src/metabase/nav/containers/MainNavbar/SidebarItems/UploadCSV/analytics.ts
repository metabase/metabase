import { trackEvent } from "metabase/lib/analytics";

export const trackButtonClicked = () => {
  trackEvent({
    event: "csv_upload_clicked",
    triggered_from: "left_nav",
  });
};
