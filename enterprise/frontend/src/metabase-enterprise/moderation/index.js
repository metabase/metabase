import { getIn } from "icepick";
import { t } from "ttag";

import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import * as Urls from "metabase/lib/urls";

import {
  ACTIONS,
  REQUEST_TYPES,
  REQUEST_STATUSES,
  REVIEW_STATUSES,
  MODERATION_TEXT,
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
});

export function getModerationIssueActionTypes(isModerator, moderationRequest) {
  return isModerator
    ? getModerationReviewActionTypes(moderationRequest)
    : getModerationRequestActionTypes();
}

function getModerationReviewActionTypes(moderationRequest) {
  return [
    REVIEW_STATUSES.verified,
    REVIEW_STATUSES.misleading,
    REVIEW_STATUSES.confusing,
    ...(moderationRequest ? ["dismiss"] : []),
  ];
}

function getModerationRequestActionTypes() {
  return [
    REQUEST_TYPES.verification_request,
    REQUEST_TYPES.something_wrong,
    REQUEST_TYPES.confused,
  ];
}

export function getStatusIconForReview(review) {
  return getModerationStatusIcon(review && review.status);
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
  return type === "dismiss";
}

export function getUserTypeTextKey(isModerator) {
  return isModerator ? "moderator" : "user";
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
