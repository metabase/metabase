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
    const issueActionTypes = getModerationIssueActionTypes(
      userType,
      targetIssueType,
    );
    return issueActionTypes
      .map((typeGrouping, i) => {
        const addBottomBorderToGrouping = i !== issueActionTypes.length - 1;

        return typeGrouping.map((type, j) => {
          const addBottomBorder =
            addBottomBorderToGrouping && j === typeGrouping.length - 1;
          const { icon, color } = getModerationStatusIcon(type);

          return {
            icon,
            iconSize: 18,
            className: cx(
              `text-${color} text-${color}-hover`,
              addBottomBorder && "border-bottom",
            ),
            action: () => onAction(type),
            title: MODERATION_TEXT[type].action,
          };
        });
      })
      .flat();
  }, [userType, targetIssueType, onAction]);

  return (
    <EntityMenu
      triggerChildren={MODERATION_TEXT[userType].action}
      triggerProps={{
        iconRight: "chevrondown",
        className: triggerClassName,
      }}
      className={className}
      items={menuItems}
    />
  );
}

const mapStateToProps = (state, props) => {
  return {
    userType: getUserTypeTextKey(getIsModerator(state, props)),
  };
};

export default connect(mapStateToProps)(ModerationIssueActionMenu);
