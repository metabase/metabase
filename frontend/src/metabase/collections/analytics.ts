import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackDataReferenceClicked = () => {
  trackSimpleEvent({
    event: "learn_about_our_data_clicked",
  });
};

export const trackCollectionBookmarked = () => {
  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: "collection",
    triggered_from: "collection_header",
  });
};
