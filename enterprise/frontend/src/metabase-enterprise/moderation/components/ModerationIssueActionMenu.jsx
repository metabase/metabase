import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import EntityMenu from "metabase/components/EntityMenu";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationIssueActionTypes,
  getColor,
  getModerationStatusIcon,
  getUserTypeTextKey,
} from "metabase-enterprise/moderation";
import { getIsModerator } from "metabase-enterprise/moderation/selectors";

ModerationIssueActionMenu.propTypes = {
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  isModerator: PropTypes.bool.isRequired,
  onAction: PropTypes.func.isRequired,
  request: PropTypes.object,
};

function ModerationIssueActionMenu({
  className,
  triggerClassName,
  onAction,
  request,
  isModerator,
}) {
  const userType = getUserTypeTextKey(isModerator);
  const types = getModerationIssueActionTypes(userType, request);
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

const mapStateToProps = (state, props) => ({
  isModerator: getIsModerator(state, props),
});

export default connect(mapStateToProps)(ModerationIssueActionMenu);
