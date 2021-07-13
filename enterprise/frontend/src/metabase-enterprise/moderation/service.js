import { ModerationReviewApi } from "metabase/services";
import { ACTIONS } from "./constants";

export function verifyItem({ text, itemId, itemType }) {
  return ModerationReviewApi.create({
    status: "verified",
    moderated_item_id: itemId,
    moderated_item_type: itemType,
    text,
  });
}

export function getVerifiedIcon() {
  const { icon, color } = ACTIONS["verified"];
  return { icon, iconColor: color };
}

export function getIconForReview(review) {
  const reviewStatus = review && review.status;

  const { icon, color } = ACTIONS[reviewStatus] || {};
  return { icon, iconColor: color };
}
