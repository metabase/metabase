import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import User from "metabase/entities/users";
import { getUser } from "metabase/selectors/user";

import Button from "metabase/components/Button";
import { ModerationIssueThread } from "metabase-enterprise/moderation/components/ModerationIssueThread";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import { SIDEBAR_VIEWS } from "metabase/query_builder/components/view/sidebars/constants";

OpenModerationIssuesPanel.propTypes = {
  setView: PropTypes.func.isRequired,
  requests: PropTypes.array.isRequired,
  onReturn: PropTypes.func.isRequired,
  users: PropTypes.array,
  isModerator: PropTypes.bool.isRequired,
  currentUser: PropTypes.object,
};

function OpenModerationIssuesPanel({
  setView,
  requests,
  onReturn,
  users,
  isModerator,
  currentUser,
}) {
  const usersById = users.reduce((map, user) => {
    map[user.id] = user;
    return map;
  }, {});

  const requestsWithMetadata = requests.map(request => {
    const user = usersById[request.requester_id];
    const requesterDisplayName = user && user.common_name;
    return {
      ...request,
      requesterDisplayName,
    };
  });

  const onModerate = async (moderationReviewType, moderationRequest) => {
    setView({
      name: SIDEBAR_VIEWS.CREATE_ISSUE_PANEL,
      props: { issueType: moderationReviewType, moderationRequest },
      previousView: SIDEBAR_VIEWS.OPEN_ISSUES_PANEL,
    });
  };

  return (
    <div className="px1">
      <div className="pt1">
        <Button
          className="text-brand text-brand-hover"
          borderless
          icon="chevronleft"
          onClick={onReturn}
        >{t`Open issues`}</Button>
      </div>
      <div className="px2">
        {requestsWithMetadata.map(request => {
          return (
            <ModerationIssueThread
              key={request.id}
              className="py2 border-row-divider"
              request={request}
              onModerate={isModerator && onModerate}
            />
          );
        })}
      </div>
    </div>
  );
}

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
  isModerator: getIsModerator(state, props),
});

export default _.compose(
  User.loadList(),
  connect(mapStateToProps),
)(OpenModerationIssuesPanel);
