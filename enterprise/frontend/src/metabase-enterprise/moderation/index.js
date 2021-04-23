import { PLUGIN_MODERATION_COMPONENTS } from "metabase/plugins";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import { ACTIONS } from "metabase-enterprise/moderation/constants";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  active: true,
  ModerationIssueActionMenu,
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
