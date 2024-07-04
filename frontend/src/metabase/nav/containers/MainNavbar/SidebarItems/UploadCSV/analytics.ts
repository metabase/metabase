import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackButtonClicked = () => {
  trackSchemaEvent("csvupload", "1-0-4", {
    event: "csv_upload_clicked",
    source: "left_nav",
  });
};
