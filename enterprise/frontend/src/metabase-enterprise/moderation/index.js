import { getIn } from "icepick";
import { t } from "ttag";

import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import * as Urls from "metabase/lib/urls";

import {
  ACTIONS,
  REQUEST_STATUSES,
  MODERATION_TEXT,
  USER_TYPES,
  REQUEST_TYPES,
  REVIEW_STATUSES,
} from "metabase-enterprise/moderation/constants";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import CreateModerationIssuePanel from "metabase-enterprise/moderation/components/CreateModerationIssuePanel";
import { OpenModerationIssuesButton } from "metabase-enterprise/moderation/components/OpenModerationIssuesButton";
import ModerationRequestsPanel from "metabase-enterprise/moderation/components/ModerationRequestsPanel";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  ModerationIssueActionMenu,
  CreateModerationIssuePanel,
  OpenModerationIssuesButton,
  ModerationRequestsPanel,
});

Object.assign(PLUGIN_MODERATION_SERVICE, {
  getStatusIconForReview,
  getOpenRequests,
  isRequestDismissal,
  getModerationEvents,
  isRequestOpen,
  getReviewType,
});

export function getModerationIssueActionTypes(userType, targetIssueType) {
  switch (userType) {
    case USER_TYPES.user:
      return [
        [
          ACTIONS.verification_request.type,
          ACTIONS.something_wrong.type,
          ACTIONS.confused.type,
        ],
      ];
    case USER_TYPES.moderator:
      return [
        [
          ACTIONS.verified.type,
          ACTIONS.misleading.type,
          ACTIONS.confusing.type,
        ],
        !isRequestType(targetIssueType) && [
          ACTIONS.verification_request.type,
          ACTIONS.something_wrong.type,
          ACTIONS.confused.type,
        ],
        getDismissalAction(targetIssueType),
      ].filter(Boolean);
    default:
      return [];
  }
}

function getDismissalAction(targetIssueType) {
  if (isReviewType(targetIssueType)) {
    return [ACTIONS.pending.type];
  }

  if (isRequestType(targetIssueType)) {
    return [ACTIONS.dismiss.type];
  }
}

export function isReviewType(type) {
  return !!REVIEW_STATUSES[type];
}

export function isRequestType(type) {
  return !!REQUEST_TYPES[type];
}

export function getStatusIconForReview(review) {
  const type = review && review.status;

  return type === REVIEW_STATUSES.pending
    ? {}
    : getModerationStatusIcon(review && review.status);
}

export function getModerationStatusIcon(type, status) {
  const icon = getIn(ACTIONS, [type, "icon"]);
  const color = getIn(ACTIONS, [type, "color"]);
  const isGrayscale = status && status !== REQUEST_STATUSES.open;

  return {
    icon,
    color,
    filter: isGrayscale ? "grayscale(1)" : "",
  };
}

export function getReviewType(question) {
  return (question.getLatestModerationReview() || {}).status;
}

export function getOpenRequests(question) {
  const moderationRequests = question.getModerationRequests();
  return moderationRequests.filter(isRequestOpen);
}

export function isRequestOpen(request) {
  return request.status === REQUEST_STATUSES.open;
}

export function getRequestStatuses() {
  return Object.values(REQUEST_STATUSES);
}

export function getNumberOfOpenRequests(question) {
  return getOpenRequests(question).length;
}

export function isRequestDismissal(type) {
  return type === ACTIONS.dismiss.type;
}

export function getUserTypeTextKey(isModerator) {
  return isModerator ? USER_TYPES.moderator : USER_TYPES.user;
}

export function getModerationEvents(
  moderationRequests,
  moderationReviews,
  usersById,
) {
  const requests = getModerationRequestEvents(moderationRequests, usersById);
  const reviews = getModerationReviewEvents(moderationReviews, usersById);

  return [...requests, ...reviews];
}

function getModerationRequestEvents(requests, usersById) {
  return requests
    .map(request => {
      const requester = usersById[request.requester_id];
      const requesterDisplayName = getUserDisplayName(requester);
      const closer = usersById[request.closed_by_id];
      const { icon } = getModerationStatusIcon(request.type);

      const requestEvent = {
        timestamp: getTimestamp(request.created_at),
        icon,
        title: `${requesterDisplayName} ${MODERATION_TEXT[request.type].creationEvent}`,
        description: request.text,
        showFooter: true,
        footerText: MODERATION_TEXT.requestStatuses[request.status],
        request,
      };

      return isRequestOpen(request)
        ? requestEvent
        : [
            requestEvent,
            {
              timestamp: getTimestamp(request.updated_at),
              icon,
              title: getRequestResolutionText(request, requester, closer),
              showFooter: true,
              footerText: t`View request`,
              request,
            },
          ];
    })
    .flat();
}

function getRequestResolutionText(request, requester, closer) {
  const requesterDisplayName = getUserDisplayName(requester);
  const closerDisplayName = getUserDisplayName(closer);
  const isOwnRequest = closer && requester.id === closer.id;

  switch (request.status) {
    case REQUEST_STATUSES.resolved:
      return isOwnRequest
        ? t`${requesterDisplayName} resolved their own request`
        : t`${requesterDisplayName}'s request was resolved by ${closerDisplayName}`;
    case REQUEST_STATUSES.dismissed:
      return isOwnRequest
        ? t`${requesterDisplayName} dismissed their own request`
        : t`${requesterDisplayName}'s request was dismissed by ${closerDisplayName}`;
    default:
      return t`${requesterDisplayName}'s request was set to ${request.status} by ${closerDisplayName}`;
  }
}

function getModerationReviewEvents(reviews, usersById) {
  return reviews.map((review, index) => {
    const moderator = usersById[review.moderator_id];
    const moderatorDisplayName = getUserDisplayName(moderator);
    const text = MODERATION_TEXT[review.status].creationEvent;
    const { icon } = getModerationStatusIcon(review.status);

    return {
      timestamp: new Date(review.created_at).valueOf(),
      icon,
      title: `${moderatorDisplayName} ${text}`,
      description: review.text,
    };
  });
}

function getUserDisplayName(user) {
  return user ? user.common_name : t`Someone`;
}

function getTimestamp(dateString) {
  return new Date(dateString).valueOf();
}

export function isUserModerator(user) {
  return user.id === 1;
}

export function buildModerationRequestPath(request, item) {
  const { moderated_item_type, id } = request;

  switch (moderated_item_type) {
    case "card":
      return Urls.question(item, "", `?moderationRequest=${id}`);
    default:
      throw new Error("The given `moderated_item_type` has no associated path");
  }
}
