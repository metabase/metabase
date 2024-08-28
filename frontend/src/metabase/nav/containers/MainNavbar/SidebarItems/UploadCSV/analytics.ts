import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackButtonClicked = () => {
  trackSchemaEvent("csvupload", {
    event: "csv_upload_clicked",
    source: "left_nav",
  });
};
