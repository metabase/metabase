import { color } from "metabase/lib/colors";
import { getRelativeTime } from "metabase/lib/time";
import { Icon, Tooltip } from "metabase/ui";
import type { ModerationReview, User } from "metabase-types/api";

import { getIconForReview, getModeratorDisplayText } from "../../service";

import { TooltipTime } from "./ModerationReviewIcon.styled";

export interface ModerationReviewIconProps {
  review: ModerationReview;
  currentUser: User;
}

const ModerationReviewIcon = ({
  review,
  currentUser,
}: ModerationReviewIconProps): JSX.Element => {
  const { name: iconName, color: iconColor } = getIconForReview(review);
  const { user: moderator } = review;

  const tooltip = moderator && (
    <div>
      <div>{getModeratorDisplayText(moderator, currentUser)}</div>
      <TooltipTime dateTime={review.created_at}>
        {getRelativeTime(review.created_at)}
      </TooltipTime>
    </div>
  );

  return (
    <Tooltip label={tooltip} disabled={!tooltip}>
      <Icon name={iconName} color={color(iconColor)} />
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModerationReviewIcon;
