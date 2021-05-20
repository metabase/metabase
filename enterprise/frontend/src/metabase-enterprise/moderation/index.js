import { getIn } from "icepick";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import {
  ACTIONS,
  REQUEST_TYPES,
  REQUEST_STATUSES,
  REVIEW_STATUSES,
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
