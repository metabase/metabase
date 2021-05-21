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
import OpenModerationIssuesPanel from "metabase-enterprise/moderation/components/OpenModerationIssuesPanel";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  ModerationIssueActionMenu,
  CreateModerationIssuePanel,
  OpenModerationIssuesButton,
  OpenModerationIssuesPanel,
});

Object.assign(PLUGIN_MODERATION_SERVICE, {
  getStatusIconForReview,
  getColorForReview,
  getOpenRequests,
  isRequestDismissal,
  getModerationEvents,
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

export function getColorForReview(review) {
  return getColor(review && review.status);
}

export function getModerationStatusIcon(type) {
  return getIn(ACTIONS, [type, "icon"]);
}

export function getColor(type) {
  return getIn(ACTIONS, [type, "color"]);
}

export function getOpenRequests(question) {
  const moderationRequests = question.getModerationRequests();
  return moderationRequests.filter(isRequestOpen);
}

function isRequestOpen(request) {
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
  const requests = question
    .getModerationRequests()
    .map(request => {
      const user = usersById[request.requester_id];
      const userDisplayName = user ? user.common_name : t`Someone`;
      const moderator = usersById[request.closed_by_id];
      const moderatorDisplayName = moderator
        ? moderator.common_name
        : t`Someone`;

      const creationEvent = {
        timestamp: new Date(request.created_at).valueOf(),
        icon: getModerationStatusIcon(request.type),
        title: `${userDisplayName} ${MODERATION_TEXT.user[request.type].creationEvent}`,
        description: request.text,
      };

      return isRequestOpen(request)
        ? creationEvent
        : [
            creationEvent,
            {
              timestamp: new Date(request.updated_at).valueOf(),
              icon: getModerationStatusIcon(request.type),
              title: t`${moderatorDisplayName} ${
                MODERATION_TEXT.moderator.requestActions[request.status]
              } ${userDisplayName}'s request`,
            },
          ];
    })
    .flat();

  const reviews = question.getModerationReviews().map((review, index) => {
    const moderator = usersById[review.moderator_id];
    const moderatorDisplayName = moderator ? moderator.common_name : t`Someone`;
    const text = MODERATION_TEXT.moderator[review.status].creationEvent;
    return {
      timestamp: new Date(review.created_at).valueOf(),
      icon: getModerationStatusIcon(review.status),
      title: `${moderatorDisplayName} ${text}`,
      description: review.text,
    };
  });

  return [...requests, ...reviews];
}
