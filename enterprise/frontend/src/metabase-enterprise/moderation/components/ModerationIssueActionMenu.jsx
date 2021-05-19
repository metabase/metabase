import React from "react";
import PropTypes from "prop-types";

import EntityMenu from "metabase/components/EntityMenu";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationReviewActionTypes,
  getModerationRequestActionTypes,
  getColor,
  getModerationStatusIcon,
} from "metabase-enterprise/moderation";

ModerationIssueActionMenu.propTypes = {
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  onAction: PropTypes.func,
  request: PropTypes.object,
  isAdmin: PropTypes.bool.isRequired,
};

function ModerationIssueActionMenu({
  className,
  triggerClassName,
  onAction,
  request,
  isAdmin,
}) {
  const types = isAdmin
    ? getModerationReviewActionTypes(request)
    : getModerationRequestActionTypes();
  const userType = isAdmin ? "moderator" : "user";
  return (
    <EntityMenu
      triggerChildren={MODERATION_TEXT[userType].action}
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
          title: MODERATION_TEXT[userType][type].action,
        };
      })}
    />
  );
}

export default ModerationIssueActionMenu;
