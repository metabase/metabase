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
import { isUserModerator, isRequestOpen } from "metabase-enterprise/moderation";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";

ModerationRequestsPanel.propTypes = {
  onModerate: PropTypes.func.isRequired,
  onComment: PropTypes.func.isRequired,
  requests: PropTypes.array.isRequired,
  comments: PropTypes.array.isRequired,
  onReturn: PropTypes.func.isRequired,
  updateModerationRequest: PropTypes.func.isRequired,
  users: PropTypes.array,
  isModerator: PropTypes.bool.isRequired,
  currentUser: PropTypes.object,
  returnText: PropTypes.string,
};

function ModerationRequestsPanel({
  onModerate,
  onComment,
  requests,
  comments,
  onReturn,
  updateModerationRequest,
  users,
  isModerator,
  currentUser,
  returnText,
}) {
  const usersById = _.indexBy(users, "id");

  const requestsWithMetadata = requests.map(request => {
    const user = usersById[request.requester_id];
    const requesterDisplayName = user && user.common_name;
    return {
      ...request,
      title: requesterDisplayName,
      timestamp: new Date(request.created_at).valueOf(),
    };
  });

  const commentsWithMetadata = comments.map(comment => {
    const user = usersById[comment.author_id];
    const authorDisplayName = user && user.common_name;

    return {
      ...comment,
      title: authorDisplayName,
      timestamp: new Date(comment.created_at).valueOf(),
      isModerator: isUserModerator(user),
    };
  });

  const commentsByRequestId = _.groupBy(
    commentsWithMetadata,
    "commented_item_id",
  );

  const onUpdateRequestText = (text, request) => {
    return updateModerationRequest({
      id: request.id,
      text,
    });
  };

  const onResolveOwnRequest = request => {
    return updateModerationRequest({
      id: request.id,
      status: "resolved",
      closed_by_id: currentUser.id,
    });
  };

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
            const isOpenRequest = isRequestOpen(request);
            const isOwnRequest = request.requester_id === currentUser.id;

            const canComment = isOpenRequest && (isModerator || isOwnRequest);
            const canModerate = isOpenRequest && isModerator;
            const canUpdateRequestText = isOpenRequest && isOwnRequest;
            const canResolveOwnRequest = isOpenRequest && isOwnRequest;

            const comments = commentsByRequestId[request.id];

            return (
              <ModerationIssueThread
                key={request.id}
                className="py2 border-row-divider"
                request={request}
                comments={comments}
                onModerate={canModerate && onModerate}
                onComment={canComment && onComment}
                onUpdateRequestText={
                  canUpdateRequestText && onUpdateRequestText
                }
                onResolveOwnRequest={
                  canResolveOwnRequest && onResolveOwnRequest
                }
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
