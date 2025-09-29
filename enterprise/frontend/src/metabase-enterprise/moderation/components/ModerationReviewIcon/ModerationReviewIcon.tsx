import { color } from "metabase/lib/colors";
import { getRelativeTime } from "metabase/lib/time-dayjs";
import { Icon, Text, Tooltip } from "metabase/ui";
import type { ModerationReview, User } from "metabase-types/api";

import { getIconForReview, getModeratorDisplayText } from "../../service";

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
      <Text
        c="text-medium"
        component="time"
        dateTime={review.created_at}
        fz="var(--mantine-font-size-xs)"
        lh={1}
      >
        {getRelativeTime(review.created_at)}
      </Text>
    </div>
  );

  return (
    <Tooltip label={tooltip} disabled={!tooltip}>
      <Icon color={color(iconColor)} flex="0 0 auto" name={iconName} />
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModerationReviewIcon;
