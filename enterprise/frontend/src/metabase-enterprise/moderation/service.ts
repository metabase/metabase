import { c, t } from "ttag";
import _ from "underscore";

import type { ColorName } from "metabase/ui/colors/types";
import type Question from "metabase-lib/v1/Question";
import type {
  BaseUser,
  IconName,
  ModerationReview,
  User,
} from "metabase-types/api";

import { MODERATION_STATUS_ICONS } from "./constants";

export { MODERATION_STATUS } from "./constants";

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
  moderator: BaseUser | null,
  currentUser: BaseUser | null,
) => {
  const { status } = moderationReview;

  if (status === "verified") {
    const bannerText = getModeratorDisplayText(moderator, currentUser);
    const tooltipText = t`Remove verification`;
    return { bannerText, tooltipText };
  }

  return {};
};

// "{0} verified this" is grammatically third-person (e.g. Spanish "{0}
// verificó esto"), so it can't be reused for the current-user case, where
// {0} is filled with the second-person pronoun "You" ("Tú verificó esto" is
// ungrammatical - it should be "Tú verificaste esto"). Callers must check
// this first and use a dedicated, independently-translatable string instead
// of substituting "You" into the third-person template.
export const isCurrentUserModerator = (
  moderator: BaseUser | null,
  currentUser?: BaseUser | null,
) => {
  const { id: moderatorId } = moderator || {};
  const { id: currentUserId } = currentUser || {};
  return currentUserId != null && moderatorId === currentUserId;
};

export const getModeratorDisplayName = (
  moderator: BaseUser | null,
  currentUser?: BaseUser | null,
) => {
  const { common_name } = moderator || {};
  const { is_superuser } = currentUser || {};

  if (isCurrentUserModerator(moderator, currentUser)) {
    return t`You`;
  } else if (moderator?.id != null && is_superuser && common_name) {
    return common_name;
  } else {
    return t`A moderator`;
  }
};

export const getModeratorDisplayText = (
  moderator: BaseUser | null,
  currentUser: BaseUser | null,
) => {
  if (isCurrentUserModerator(moderator, currentUser)) {
    return t`You verified this`;
  }
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
  moderator: BaseUser | null,
  currentUser?: User,
) => {
  const isCurrentUser = isCurrentUserModerator(moderator, currentUser);
  const moderatorDisplayName = getModeratorDisplayName(moderator, currentUser);

  switch (review.status) {
    case "verified":
      return isCurrentUser
        ? t`You verified this`
        : c("{0} is the name of a user")
            .t`${moderatorDisplayName} verified this`;
    case null:
      return isCurrentUser
        ? t`You removed verification`
        : c("{0} is the name of a user")
            .t`${moderatorDisplayName} removed verification`;
    default:
      return isCurrentUser
        ? c("{0} is the status of a review")
            .t`You changed status to ${review.status}`
        : c("{0} is the name of a user, {1} is the status of a review")
            .t`${moderatorDisplayName} changed status to ${review.status}`;
  }
};

export function getModerationTimelineEvents(
  reviews: ModerationReview[],
  currentUser?: User,
) {
  return reviews.map((review) => {
    const moderator = review.user;
    const text = getModerationReviewEventText(review, moderator, currentUser);
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
    ? // Unjustified type cast. FIXME
      { icon: "model_with_badge" as IconName, tooltip: "Verified model" }
    : null;
};
