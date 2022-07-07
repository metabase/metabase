import React from "react";
import { color } from "metabase/lib/colors";
import { getRelativeTimeAbbreviated } from "metabase/lib/time";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { ModerationReview, User } from "metabase-types/api";
import { getIconForReview, getModeratorDisplayText } from "../../service";
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
  const { name: iconName, color: iconColor } = getIconForReview(review);

  const tooltip = moderator && (
    <TooltipContainer>
      <TooltipText>
        {getModeratorDisplayText(moderator, currentUser)}
      </TooltipText>
      <TooltipTime dateTime={review.created_at}>
        {getRelativeTimeAbbreviated(review.created_at)}
      </TooltipTime>
    </TooltipContainer>
  );

  return (
    <Tooltip tooltip={tooltip}>
      <Icon name={iconName} color={color(iconColor)} />
    </Tooltip>
  );
};

export default ModerationReviewIcon;
