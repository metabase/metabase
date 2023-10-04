import { t } from "ttag";
import _ from "underscore";

import { ModerationReviewApi } from "metabase/services";
import { MODERATION_STATUS_ICONS } from "./constants";

export { MODERATION_STATUS } from "./constants";

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

const noIcon = {};
export function getStatusIcon(status) {
  if (isRemovedReviewStatus(status)) {
    return noIcon;
  }

  return MODERATION_STATUS_ICONS[status] || noIcon;
}

export function getIconForReview(review, options) {
  return getStatusIcon(review?.status, options);
}

// we only want the icon that represents the removal of a review in special cases,
// so you must ask for the icon explicitly
export function getRemovedReviewStatusIcon() {
  return MODERATION_STATUS_ICONS[null];
}

export function getLatestModerationReview(reviews) {
  const maybeReview = _.findWhere(reviews, {
    most_recent: true,
  });

  // since we can't delete reviews, consider a most recent review with a status of null to mean there is no review
  return isRemovedReviewStatus(maybeReview?.status) ? undefined : maybeReview;
}

export function getStatusIconForQuestion(question) {
  const reviews = question.getModerationReviews();
  const review = getLatestModerationReview(reviews);
  return getIconForReview(review);
}

export function getTextForReviewBanner(
  moderationReview,
  moderator,
  currentUser,
) {
  const { status } = moderationReview;

  if (status === "verified") {
    const bannerText = getModeratorDisplayText(moderator, currentUser);
    const tooltipText = t`Remove verification`;
    return { bannerText, tooltipText };
  }

  return {};
}

export function getModeratorDisplayName(moderator, currentUser) {
  const { id: moderatorId, common_name } = moderator || {};
  const { id: currentUserId } = currentUser || {};

  if (currentUserId != null && moderatorId === currentUserId) {
    return t`You`;
  } else if (moderatorId != null) {
    return common_name;
  } else {
    return t`A moderator`;
  }
}

export function getModeratorDisplayText(moderator, currentUser) {
  const moderatorName = getModeratorDisplayName(moderator, currentUser);
  return t`${moderatorName} verified this`;
}

// a `status` of `null` represents the removal of a review, since we can't delete reviews
export function isRemovedReviewStatus(status) {
  return String(status) === "null";
}

export function isItemVerified(review) {
  return review != null && review.status === "verified";
}

function getModerationReviewEventText(review, moderatorDisplayName) {
  switch (review.status) {
    case "verified":
      return t`${moderatorDisplayName} verified this`;
    case null:
      return t`${moderatorDisplayName} removed verification`;
    default:
      return t`${moderatorDisplayName} changed status to ${review.status}`;
  }
}

export function getModerationTimelineEvents(reviews, usersById, currentUser) {
  return reviews.map(review => {
    const moderator = usersById[review.moderator_id];
    const moderatorDisplayName = getModeratorDisplayName(
      moderator,
      currentUser,
    );
    const text = getModerationReviewEventText(review, moderatorDisplayName);
    const icon = isRemovedReviewStatus(review.status)
      ? getRemovedReviewStatusIcon()
      : getIconForReview(review);

    return {
      timestamp: new Date(review.created_at).toISOString(),
      icon,
      title: text,
    };
  });
}
