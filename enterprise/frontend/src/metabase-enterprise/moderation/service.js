import { t } from "ttag";
import _ from "underscore";

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

export function removeReview({ itemId, itemType }) {
  return ModerationReviewApi.create({
    status: null,
    moderated_item_id: itemId,
    moderated_item_type: itemType,
  });
}

export function getVerifiedIcon() {
  const { icon, color } = ACTIONS["verified"];
  return { icon, iconColor: color };
}

export function getIconForReview(review) {
  if (review && review.status !== null) {
    const { status } = review;
    const { icon, color } = ACTIONS[status] || {};
    return { icon, iconColor: color };
  }

  return {};
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

export function isItemVerified(review) {
  return review != null && review.status === "verified";
}

export function getLatestModerationReview(reviews) {
  const review = _.findWhere(reviews, {
    most_recent: true,
  });

  // since we can't delete reviews, consider a most recent review with a status of null to mean there is no review
  if (review && review.status !== null) {
    return review;
  }
}

export function getStatusIconForReviews(reviews) {
  const review = getLatestModerationReview(reviews);
  return getIconForReview(review);
}
