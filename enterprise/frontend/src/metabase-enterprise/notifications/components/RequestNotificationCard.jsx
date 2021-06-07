import React from "react";
import PropTypes from "prop-types";

import Comment from "metabase/components/Comment";
import ModerationIssuePill from "metabase-enterprise/moderation/components/ModerationIssuePill";
import {
  QuestionNameHeader,
  CardLink,
  HoverableCard,
  CardHeader,
} from "./RequestNotificationCard.styled";

RequestNotificationCard.propTypes = {
  className: PropTypes.string,
  userDisplayName: PropTypes.string.isRequired,
  questionDisplayName: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  request: PropTypes.object.isRequired,
};

function RequestNotificationCard({
  className,
  userDisplayName,
  questionDisplayName,
  url,
  request,
}) {
  return (
    <CardLink className={className} to={url}>
      <HoverableCard hoverable>
        <CardHeader>
          <ModerationIssuePill type={request.type} status={request.status} />
          <QuestionNameHeader>{questionDisplayName}</QuestionNameHeader>
        </CardHeader>
        <Comment
          title={userDisplayName}
          text={request.text}
          timestamp={request.created_at}
        />
      </HoverableCard>
    </CardLink>
  );
}

export default RequestNotificationCard;
