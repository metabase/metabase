import { skipToken, useGetUserQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { FixedSizeIcon, Flex, Text } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import {
  getIconForReview,
  getLatestModerationReview,
  getTextForReviewBanner,
} from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, ModerationReview } from "metabase-types/api";

const ICON_BUTTON_SIZE = 16;

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
        mt="xs"
      />
      <Text>
        {bannerText} {relativeCreationTime}
      </Text>
    </Flex>
  );
};
