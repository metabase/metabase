import _ from "underscore";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { skipToken, useGetUserQuery } from "metabase/api";
import { alpha, color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getRelativeTime } from "metabase/lib/time";
import { FixedSizeIcon, Flex, Icon, Text as UIText } from "metabase/ui";
import {
  getIconForReview,
  getLatestModerationReview,
  getTextForReviewBanner,
} from "metabase-enterprise/moderation/service";
import type Question from "metabase-lib/v1/Question";
import type { ModerationReview } from "metabase-types/api";

import Styles from "./ModerationReview.module.css";
import {
  Container,
  Text,
  TextContainer,
  Time,
} from "./ModerationReviewBanner.styled";
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
  const currentUser = useSelector(getCurrentUser);

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
    <Container
      style={{ backgroundColor: alpha(iconColor, 0.2) }}
      className={className}
    >
      <Icon name={iconName} color={color(iconColor)} size={ICON_BUTTON_SIZE} />
      <TextContainer>
        <Text>{bannerText}</Text>
        <Time dateTime={moderationReview.created_at}>
          {relativeCreationTime}
        </Time>
      </TextContainer>
    </Container>
  );
};

export const ModerationReviewText = ({ question }: { question: Question }) => {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const { data: moderator } = useGetUserQuery(
    latestModerationReview?.moderator_id ?? skipToken,
  );
  const currentUser = useSelector(getCurrentUser);

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
        color={color(iconColor)}
        size={ICON_BUTTON_SIZE}
        className={Styles.IconMargin}
      />
      <UIText>
        {bannerText} {relativeCreationTime}
      </UIText>
    </Flex>
  );
};
