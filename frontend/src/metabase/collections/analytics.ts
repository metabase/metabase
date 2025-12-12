import { trackSimpleEvent } from "metabase/lib/analytics";
import type { CollectionItem } from "metabase-types/api/collection";

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

export const trackCollectionItemBookmarked = (item: CollectionItem) => {
  if (item.model === "indexed-entity" || item.model === "snippet") {
    return;
  }

  const analyticsModel = item.model;

  const getEntityForAnalytics = (
    analyticsModel:
      | "metric"
      | "dashboard"
      | "collection"
      | "dataset"
      | "document"
      | "card"
      | "table",
  ) => {
    switch (analyticsModel) {
      case "card":
        return "question";
      case "dataset":
        return "model";
      default:
        return analyticsModel;
    }
  };

  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: getEntityForAnalytics(analyticsModel),
    triggered_from: "collection_list",
  });
};
