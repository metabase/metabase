import React from "react";
import PropTypes from "prop-types";

import Comment from "metabase/components/Comment";
import ModerationIssuePill from "metabase-enterprise/moderation/components/ModerationIssuePill";
import {
  QuestionName,
  BoundWidthLink,
  PaddedCard,
  CardHeader,
} from "./RequestNotificationCard.styled";

RequestNotificationCard.propTypes = {
  userDisplayName: PropTypes.string.isRequired,
  questionDisplayName: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  request: PropTypes.object.isRequired,
};

function RequestNotificationCard({
  userDisplayName,
  questionDisplayName,
  url,
  request,
}) {
  return (
    <BoundWidthLink to={url}>
      <PaddedCard hoverable>
        <CardHeader>
          <ModerationIssuePill type={request.type} status={request.status} />
          <QuestionName>{questionDisplayName}</QuestionName>
        </CardHeader>
        <Comment
          title={userDisplayName}
          text={request.text}
          timestamp={request.created_at}
        />
      </PaddedCard>
    </BoundWidthLink>
  );
}

export default RequestNotificationCard;
