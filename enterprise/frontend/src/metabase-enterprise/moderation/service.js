import { t } from "ttag";

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

export function getTextForReviewBanner(
  moderationReview,
  moderator,
  currentUser,
) {
  const moderatorName = getUserDisplayName(moderator, currentUser);
  const { status } = moderationReview;

  if (status === "verified") {
    const bannerText = t`${moderatorName} verified this`;
    const tooltipText = t`Remove verification`;
    return { bannerText, tooltipText };
  }

  return {};
}

function getUserDisplayName(user, currentUser) {
  const { id: userId, display_name } = user || {};
  const { id: currentUserId } = currentUser || {};

  if (currentUserId != null && userId === currentUserId) {
    return t`You`;
  } else if (userId != null) {
    return display_name;
  } else {
    return t`Someone`;
  }
}
