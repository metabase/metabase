import React from "react";
import Comment from "metabase/components/Comment";
import ModerationIssuePill from "metabase-enterprise/moderation/components/ModerationIssuePill";
import {
  QuestionName,
  BoundWidthLink,
  PaddedCard,
  CardHeader,
} from "./RequestNotificationCard.styled";

function RequestNotificationCard() {
  const issueType = "verification_request";
  const status = "open";

  const userDisplayName = "Foo Bar";
  const text = "a b c d \n e f g h";
  const timestamp = Date.now();

  return (
    <BoundWidthLink to="/question/1">
      <PaddedCard hoverable>
        <CardHeader>
          <ModerationIssuePill type={issueType} status={status} />
          <QuestionName>Question Name</QuestionName>
        </CardHeader>
        <Comment title={userDisplayName} text={text} timestamp={timestamp} />
      </PaddedCard>
    </BoundWidthLink>
  );
}

export default RequestNotificationCard;
