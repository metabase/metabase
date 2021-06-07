import { getIn } from "icepick";
import { t } from "ttag";

import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";

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

  console.log(status, isGrayscale, REQUEST_STATUSES.open, REQUEST_STATUSES);

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

export function getNumberOfOpenRequests(question) {
  return getOpenRequests(question).length;
}

export function isRequestDismissal(type) {
  return type === "dismiss";
}

export function getUserTypeTextKey(isModerator) {
  return isModerator ? "moderator" : "user";
}

export function getModerationEvents(question, usersById) {
  const requests = question.getModerationRequests().map(request => {
    const user = usersById[request.requester_id];
    const userDisplayName = user ? user.common_name : t`Someone`;
    const { icon } = getModerationStatusIcon(request.type);

    return {
      timestamp: new Date(request.created_at).valueOf(),
      icon,
      title: `${userDisplayName} ${MODERATION_TEXT[request.type].creationEvent}`,
      description: request.text,
      showFooter: true,
      requestStatusText: MODERATION_TEXT.requestStatuses[request.status],
      request,
    };
  });

  const reviews = question.getModerationReviews().map((review, index) => {
    const moderator = usersById[review.moderator_id];
    const moderatorDisplayName = moderator ? moderator.common_name : t`Someone`;
    const text = MODERATION_TEXT[review.status].creationEvent;
    const { icon } = getModerationStatusIcon(review.status);

    return {
      timestamp: new Date(review.created_at).valueOf(),
      icon,
      title: `${moderatorDisplayName} ${text}`,
      description: review.text,
    };
  });

  return [...requests, ...reviews];
}

export function isUserModerator(user) {
  return user.id === 1;
}
