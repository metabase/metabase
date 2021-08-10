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

export function getStatusIcon(status) {
  const { icon, color } = ACTIONS[status] || {};
  return { name: icon, color };
}

export function getVerifiedIcon() {
  return getStatusIcon("verified");
}

export function getIconForReview(review) {
  return getStatusIcon(review?.status);
}

export function getTextForReviewBanner(
  moderationReview,
  moderator,
  currentUser,
) {
  const moderatorName = getModeratorDisplayName(moderator, currentUser);
  const { status } = moderationReview;

  if (status === "verified") {
    const bannerText = t`${moderatorName} verified this`;
    const tooltipText = t`Remove verification`;
    return { bannerText, tooltipText };
  }

  return {};
}

function getModeratorDisplayName(user, currentUser) {
  const { id: userId, display_name } = user || {};
  const { id: currentUserId } = currentUser || {};

  if (currentUserId != null && userId === currentUserId) {
    return t`You`;
  } else if (userId != null) {
    return display_name;
  } else {
    return t`A moderator`;
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

export function getStatusIconForQuestion(question) {
  const reviews = question.getModerationReviews();
  const review = getLatestModerationReview(reviews);
  return getIconForReview(review);
}
