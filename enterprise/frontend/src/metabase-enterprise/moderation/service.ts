import { c, t } from "ttag";
import _ from "underscore";

import type { ColorName } from "metabase/lib/colors/types";
import { ModerationReviewApi } from "metabase/services";
import type { IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ModerationReview, User } from "metabase-types/api";

import { MODERATION_STATUS_ICONS } from "./constants";

export { MODERATION_STATUS } from "./constants";

export function verifyItem({
  text,
  itemId,
  itemType,
}: {
  text: string;
  itemId: number;
  itemType: string;
}) {
  return ModerationReviewApi.create({
    status: "verified",
    moderated_item_id: itemId,
    moderated_item_type: itemType,
    text,
  });
}

export function removeReview({
  itemId,
  itemType,
}: {
  itemId: number;
  itemType: string;
}) {
  return ModerationReviewApi.create({
    status: null,
    moderated_item_id: itemId,
    moderated_item_type: itemType,
  });
}

type NoIcon = Record<string, never>;

const noIcon: NoIcon = {};

export const getStatusIcon = (
  status: string | null | undefined,
  filled = false,
): { name: IconName; color: ColorName } | NoIcon => {
  if (!status || isRemovedReviewStatus(status)) {
    return noIcon;
  }

  if (status === "verified" && filled) {
    return MODERATION_STATUS_ICONS.get("verified_filled") || noIcon;
  }

  return MODERATION_STATUS_ICONS.get(status) || noIcon;
};

export function getIconForReview(review: ModerationReview, options?: any) {
  return getStatusIcon(review?.status, options);
}

// we only want the icon that represents the removal of a review in special cases,
// so you must ask for the icon explicitly
export function getRemovedReviewStatusIcon() {
  return MODERATION_STATUS_ICONS.get(null);
}

export function getLatestModerationReview(reviews: ModerationReview[]) {
  const maybeReview = _.findWhere(reviews, {
    most_recent: true,
  });
  if (!maybeReview) {
    return undefined;
  }
  // since we can't delete reviews, consider a most recent review with a status of null to mean there is no review
  return isRemovedReviewStatus(maybeReview.status) ? undefined : maybeReview;
}

export const getStatusIconForQuestion = (question: Question) => {
  const reviews = question.getModerationReviews();
  const review = getLatestModerationReview(reviews);
  return review ? getIconForReview(review) : noIcon;
};

export const getTextForReviewBanner = (
  moderationReview: ModerationReview,
  moderator: User | null,
  currentUser: User | null,
) => {
  const { status } = moderationReview;

  if (status === "verified") {
    const bannerText = getModeratorDisplayText(moderator, currentUser);
    const tooltipText = t`Remove verification`;
    return { bannerText, tooltipText };
  }

  return {};
};

export const getModeratorDisplayName = (
  moderator: User | null,
  currentUser?: User | null,
) => {
  const { id: moderatorId, common_name } = moderator || {};
  const { id: currentUserId } = currentUser || {};

  if (currentUserId != null && moderatorId === currentUserId) {
    return t`You`;
  } else if (moderatorId != null && common_name) {
    return common_name;
  } else {
    return t`A moderator`;
  }
};

export const getModeratorDisplayText = (
  moderator: User | null,
  currentUser: User | null,
) => {
  const moderatorName = getModeratorDisplayName(moderator, currentUser);
  return c("{0} is the name of a user").t`${moderatorName} verified this`;
};

// a `status` of `null` represents the removal of a review, since we can't delete reviews
export const isRemovedReviewStatus = (status: string | null) => {
  return status === null;
};

export const isItemVerified = (
  review?: ModerationReview | undefined | null,
) => {
  return review != null && review.status === "verified";
};

const getModerationReviewEventText = (
  review: ModerationReview,
  moderatorDisplayName: string,
) => {
  switch (review.status) {
    case "verified":
      return c("{0} is the name of a user")
        .t`${moderatorDisplayName} verified this`;
    case null:
      return c("{0} is the name of a user")
        .t`${moderatorDisplayName} removed verification`;
    default:
      return c("{0} is the name of a user, {1} is the status of a review")
        .t`${moderatorDisplayName} changed status to ${review.status}`;
  }
};

export function getModerationTimelineEvents(
  reviews: ModerationReview[],
  usersById: Record<number, User>,
  currentUser?: User,
) {
  return reviews.map(review => {
    const moderator = review.moderator_id
      ? usersById[review.moderator_id]
      : null;
    const moderatorDisplayName = getModeratorDisplayName(
      moderator,
      currentUser,
    );
    const text = getModerationReviewEventText(review, moderatorDisplayName);
    const icon = isRemovedReviewStatus(review.status)
      ? getRemovedReviewStatusIcon()
      : getIconForReview(review);

    return {
      timestamp: review.created_at
        ? new Date(review.created_at).toISOString()
        : null,
      icon,
      title: text,
    };
  });
}

export const getQuestionIcon = (card: any) => {
  return (card.model === "dataset" || card.type === "model") &&
    card.moderated_status === "verified"
    ? { icon: "model_with_badge" as IconName, tooltip: "Verified model" }
    : null;
};
