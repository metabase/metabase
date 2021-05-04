import React from "react";
import PropTypes from "prop-types";

import EntityMenu from "metabase/components/EntityMenu";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationIssueTypes,
  getModerationRequestActionTypes,
  getColor,
  getModerationStatusIcon,
} from "metabase-enterprise/moderation";

function ModerationIssueActionMenu({
  className,
  triggerClassName,
  onAction,
  issue,
}) {
  const types = issue
    ? getModerationRequestActionTypes()
    : getModerationIssueTypes();

  return (
    <EntityMenu
      triggerChildren={MODERATION_TEXT.moderator.action}
      triggerProps={{
        iconRight: "chevrondown",
        className: triggerClassName,
      }}
      className={className}
      items={types.map(type => {
        const color = getColor(type);
        const icon = getModerationStatusIcon(type);
        return {
          icon,
          iconSize: 18,
          className: `text-${color}`,
          action: () => onAction(type),
          // todo  -- fn to change title when issue exists
          title: MODERATION_TEXT.moderator[type].action,
        };
      })}
    />
  );
}

ModerationIssueActionMenu.propTypes = {
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  onAction: PropTypes.func,
  issue: PropTypes.object,
};

export default ModerationIssueActionMenu;
