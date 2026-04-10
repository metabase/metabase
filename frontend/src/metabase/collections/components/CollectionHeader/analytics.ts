import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackNewCollectionFromHeaderInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "collection-header",
  });

export const trackCSVFileUploadClicked = () =>
  trackSimpleEvent({
    event: "csv_upload_clicked",
    triggered_from: "collection",
  });

export const trackEventsClicked = () =>
  trackSimpleEvent({
    event: "events_clicked",
    triggered_from: "collection",
  });
