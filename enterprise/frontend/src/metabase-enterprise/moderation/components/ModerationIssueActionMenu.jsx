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
  const issueTypes = getModerationIssueActionTypes(isModerator, request);

  return (
    <EntityMenu
      triggerChildren={MODERATION_TEXT[userType].action}
      triggerProps={{
        iconRight: "chevrondown",
        className: triggerClassName,
      }}
      className={className}
      items={issueTypes.map(issueType => {
        const color = getColor(issueType);
        const icon = getModerationStatusIcon(issueType);
        return {
          icon,
          iconSize: 18,
          className: `text-${color}`,
          action: () => onAction(issueType),
          title: MODERATION_TEXT[userType][issueType].action,
        };
      })}
    />
  );
}

const mapStateToProps = (state, props) => ({
  isModerator: getIsModerator(state, props),
});

export default connect(mapStateToProps)(ModerationIssueActionMenu);
