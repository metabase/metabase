import { trackSimpleEvent } from "metabase/analytics";
import type {
  CollectionId,
  CollectionItem,
} from "metabase-types/api/collection";

type CollectionItemActionResult = "success" | "failure";
type CollectionItemPinTriggeredFrom =
  | "item_menu"
  | "bulk_action_bar"
  | "drag_and_drop";
type CollectionItemMoveTriggeredFrom = "drag_and_drop" | "move_modal";

const getEntityForAnalytics = (model: CollectionItem["model"]) => {
  switch (model) {
    case "card":
      return "question";
    case "dataset":
      return "model";
    default:
      return model;
  }
};

const getCollectionTargetId = (collectionId?: CollectionId) =>
  typeof collectionId === "number" ? collectionId : null;

const trackCollectionItemPinResult = ({
  item,
  pinned,
  triggeredFrom,
  result,
}: {
  item: CollectionItem;
  pinned: boolean;
  triggeredFrom: CollectionItemPinTriggeredFrom;
  result: CollectionItemActionResult;
}) => {
  trackSimpleEvent({
    event: pinned ? "collection_item_pinned" : "collection_item_unpinned",
    event_detail: getEntityForAnalytics(item.model),
    target_id: item.id,
    triggered_from: triggeredFrom,
    result,
  });
};

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

export const trackCollectionItemsFiltered = ({
  collectionId,
  filter,
}: {
  collectionId?: CollectionId;
  filter: "search" | "type";
}) => {
  trackSimpleEvent({
    event: "collection_items_filtered",
    event_detail: filter,
    target_id: getCollectionTargetId(collectionId),
  });
};

export const trackCollectionSelectModeEntered = (
  collectionId: CollectionId,
) => {
  trackSimpleEvent({
    event: "collection_select_mode_entered",
    target_id: getCollectionTargetId(collectionId),
  });
};

export const setCollectionItemPinnedAndTrack = async ({
  item,
  pinned,
  triggeredFrom,
  setPinned,
}: {
  item: CollectionItem;
  pinned: boolean;
  triggeredFrom: CollectionItemPinTriggeredFrom;
  setPinned: () => PromiseLike<unknown>;
}) => {
  const trackEvent = (result: CollectionItemActionResult) =>
    trackCollectionItemPinResult({ item, pinned, triggeredFrom, result });
  let mutationResult: unknown;

  try {
    mutationResult = await setPinned();
  } catch (error) {
    trackEvent("failure");
    throw error;
  }

  const failed =
    typeof mutationResult === "object" &&
    mutationResult !== null &&
    "error" in mutationResult;
  trackEvent(failed ? "failure" : "success");
};

export const moveCollectionItemAndTrack = async ({
  item,
  move,
  triggeredFrom,
}: {
  item: CollectionItem;
  move: () => Promise<unknown>;
  triggeredFrom: CollectionItemMoveTriggeredFrom;
}) => {
  const trackEvent = (result: CollectionItemActionResult) =>
    trackSimpleEvent({
      event: "collection_item_moved",
      event_detail: getEntityForAnalytics(item.model),
      target_id: item.id,
      triggered_from: triggeredFrom,
      result,
    });

  try {
    await move();
  } catch (error) {
    trackEvent("failure");
    throw error;
  }

  trackEvent("success");
};

export const trackCollectionItemBookmarked = (
  item: CollectionItem & {
    model: CollectionItem["model"];
  },
) => {
  if (
    item.model === "indexed-entity" ||
    item.model === "snippet" ||
    item.model === "transform" ||
    item.model === "measure"
  ) {
    // can't bookmark these
    return;
  }

  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: getEntityForAnalytics(item.model),
    triggered_from: "collection_list",
  });
};
