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
  getModerationStatusIcon,
});

export function getModerationActionsList() {
  return [ACTIONS.verification, ACTIONS.flag, ACTIONS.question];
}

export function getModerationStatusIcon(type) {
  const { icon } = ACTIONS[type] || {};
  return icon;
}

export function getColor(type) {
  const { color } = ACTIONS[type] || {};
  return color;
}
