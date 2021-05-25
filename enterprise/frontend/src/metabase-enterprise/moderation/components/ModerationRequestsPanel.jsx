import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import User from "metabase/entities/users";
import { getUser } from "metabase/selectors/user";

import Button from "metabase/components/Button";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { ModerationIssueThread } from "metabase-enterprise/moderation/components/ModerationIssueThread";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";

ModerationRequestsPanel.propTypes = {
  onModerate: PropTypes.func.isRequired,
  requests: PropTypes.array.isRequired,
  onReturn: PropTypes.func.isRequired,
  users: PropTypes.array,
  isModerator: PropTypes.bool.isRequired,
  currentUser: PropTypes.object,
  returnText: PropTypes.string,
};

function ModerationRequestsPanel({
  onModerate,
  requests,
  onReturn,
  users,
  isModerator,
  currentUser,
  returnText,
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

  return (
    <SidebarContent className="full-height px1">
      <div className="pt1">
        <Button
          className="text-brand text-brand-hover"
          borderless
          icon="chevronleft"
          onClick={onReturn}
        >
          {returnText || t`Back`}
        </Button>
      </div>
      <div className="px2">
        {requestsWithMetadata.length > 0 ? (
          requestsWithMetadata.map(request => {
            return (
              <ModerationIssueThread
                key={request.id}
                className="py2 border-row-divider"
                request={request}
                onModerate={isModerator && onModerate}
              />
            );
          })
        ) : (
          <div className="text-body text-medium p1">{t`No issues found`}</div>
        )}
      </div>
    </SidebarContent>
  );
}

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
  isModerator: getIsModerator(state, props),
});

export default _.compose(
  User.loadList(),
  connect(mapStateToProps),
)(ModerationRequestsPanel);
