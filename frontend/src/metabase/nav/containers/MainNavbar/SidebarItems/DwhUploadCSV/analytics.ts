import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackDWHUploadCSVClicked = () => {
  trackSimpleEvent({
    event: "csv_upload_clicked",
    triggered_from: "left-nav",
  });
};
