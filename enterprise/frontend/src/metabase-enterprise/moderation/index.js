import { getIn } from "icepick";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import { ACTIONS } from "metabase-enterprise/moderation/constants";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import CreateModerationIssuePanel from "metabase-enterprise/moderation/components/CreateModerationIssuePanel";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  ModerationIssueActionMenu,
  CreateModerationIssuePanel,
});

Object.assign(PLUGIN_MODERATION_SERVICE, {
  getStatusIconForReview,
  getColorForReview,
});

export function getModerationActionsList() {
  return [ACTIONS.verified, ACTIONS.misleading, ACTIONS.confusing];
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
