import React from "react";
import { getRelativeTimeAbbreviated } from "metabase/lib/time";
import { ModerationReview, User } from "metabase-types/api";
import { getModeratorDisplayText } from "../../service";
import {
  TooltipContainer,
  TooltipText,
  TooltipTime,
} from "./ModerationReviewIcon.styled";

export interface ModerationReviewIconProps {
  review: ModerationReview;
  moderator?: User;
  currentUser: User;
}

const ModerationReviewIcon = ({
  review,
  moderator,
  currentUser,
}: ModerationReviewIconProps): JSX.Element => {
  const text = moderator && getModeratorDisplayText(moderator, currentUser);
  const createdAt = getRelativeTimeAbbreviated(review.created_at);

  return (
    <TooltipContainer>
      <TooltipText>{text}</TooltipText>
      <TooltipTime dateTime={review.created_at}>{createdAt}</TooltipTime>
    </TooltipContainer>
  );
};

export default ModerationReviewIcon;
