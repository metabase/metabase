import cx from "classnames";

import { skipToken, useGetUserQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { FixedSizeIcon, Flex, Icon, Stack, Text } from "metabase/ui";
import { alpha } from "metabase/ui/colors";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import {
  getIconForReview,
  getLatestModerationReview,
  getTextForReviewBanner,
} from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, ModerationReview } from "metabase-types/api";

import S from "./ModerationReview.module.css";

const ICON_BUTTON_SIZE = 16;

interface ModerationReviewBannerProps {
  moderationReview: ModerationReview;
  className?: string;
}

export const ModerationReviewBanner = ({
  moderationReview,
  className,
}: ModerationReviewBannerProps) => {
  const { data: moderator } = useGetUserQuery(moderationReview.moderator_id);
  const currentUser = useSelector(getUser);

  if (!moderator) {
    return null;
  }

  const { bannerText } = getTextForReviewBanner(
    moderationReview,
    moderator,
    currentUser,
  );
  const relativeCreationTime = getRelativeTime(moderationReview.created_at);
  const { name: iconName, color: iconColor } =
    getIconForReview(moderationReview);

  return (
    <Flex
      className={cx(S.container, className)}
      style={{ backgroundColor: alpha(iconColor, 0.2) }}
      p="md"
      justify="space-between"
      align="flex-start"
      gap="sm"
    >
      <Icon name={iconName} c={iconColor} size={ICON_BUTTON_SIZE} />
      <Stack gap="xs" flex={1}>
        <Text component="span" fz="md" fw="bold" lh="sm">
          {bannerText}
        </Text>
        <Text
          component="time"
          c="text-secondary"
          fz="sm"
          dateTime={moderationReview.created_at}
        >
          {relativeCreationTime}
        </Text>
      </Stack>
    </Flex>
  );
};

export const ModerationReviewTextForQuestion = ({
  question,
}: {
  question: Question;
}) => {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  return (
    <ModerationReviewText latestModerationReview={latestModerationReview} />
  );
};

export const ModerationReviewTextForDashboard = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const latestModerationReview = getLatestModerationReview(
    dashboard.moderation_reviews || [],
  );

  return (
    <ModerationReviewText latestModerationReview={latestModerationReview} />
  );
};

const ModerationReviewText = ({
  latestModerationReview,
}: {
  latestModerationReview?: ModerationReview;
}) => {
  const { data: moderator } = useGetUserQuery(
    latestModerationReview?.moderator_id ?? skipToken,
  );
  const currentUser = useSelector(getUser);

  if (!latestModerationReview) {
    return null;
  }

  const { bannerText } = getTextForReviewBanner(
    latestModerationReview,
    moderator ?? null,
    currentUser,
  );

  const relativeCreationTime = getRelativeTime(
    latestModerationReview.created_at,
  );

  const { name: iconName, color: iconColor } = getIconForReview(
    latestModerationReview,
  );

  return (
    <Flex gap="sm" align="top">
      <FixedSizeIcon
        name={iconName}
        c={iconColor}
        size={ICON_BUTTON_SIZE}
        className={S.iconMargin}
      />
      <Text>
        {bannerText} {relativeCreationTime}
      </Text>
    </Flex>
  );
};
