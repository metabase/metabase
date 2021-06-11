import React, { useMemo } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";

import EntityMenu from "metabase/components/EntityMenu";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationIssueActionTypes,
  getModerationStatusIcon,
  getUserTypeTextKey,
} from "metabase-enterprise/moderation";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";

const mapStateToProps = (state, props) => {
  return {
    userType: getUserTypeTextKey(getIsModerator(state, props)),
  };
};

export default connect(mapStateToProps)(ModerationIssueActionMenu);

ModerationIssueActionMenu.propTypes = {
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  onAction: PropTypes.func.isRequired,
  targetIssueType: PropTypes.string,
  userType: PropTypes.string.isRequired,
};

function ModerationIssueActionMenu({
  className,
  triggerClassName,
  onAction,
  targetIssueType,
  userType,
}) {
  const menuItems = useMemo(() => {
    return buildActionMenuItems(userType, targetIssueType, onAction);
  }, [userType, targetIssueType, onAction]);

  const triggerProps = useMemo(() => {
    return {
      iconRight: "chevrondown",
      className: triggerClassName,
    };
  }, [triggerClassName]);

  return (
    <EntityMenu
      triggerChildren={MODERATION_TEXT[userType].action}
      triggerProps={triggerProps}
      className={className}
      items={menuItems}
    />
  );
}

function buildActionMenuItems(userType, targetIssueType, onAction) {
  const issueActionTypes = getModerationIssueActionTypes(
    userType,
    targetIssueType,
  );

  // the above function `getModerationIssueActionTypes` returns an array of arrays, but the `EntityMenu` expects a flat list of `items`
  // so we flatten the groups and reflect the groupings via a border-bottom applied to the final entry in a grouping
  return issueActionTypes
    .map((typeGrouping, i) => {
      const isNotLastGroupOfTypes = i !== issueActionTypes.length - 1;

      return typeGrouping.map((type, j) => {
        const isLastTypeInGroup = j === typeGrouping.length - 1;
        const { icon, color } = getModerationStatusIcon(type);

        return {
          icon,
          iconSize: 18,
          className: cx(
            `text-${color} text-${color}-hover`,
            isNotLastGroupOfTypes && isLastTypeInGroup && "border-bottom",
          ),
          action: () => onAction(type),
          title: MODERATION_TEXT[type].action,
        };
      });
    })
    .flat();
}
