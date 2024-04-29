import { connect } from "react-redux";
import _ from "underscore";

import Users from "metabase/entities/users";
import { alpha, color } from "metabase/lib/colors";
import { getRelativeTime } from "metabase/lib/time";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import {
  getIconForReview,
  getTextForReviewBanner,
} from "metabase-enterprise/moderation/service";
import type { ModerationReview, User } from "metabase-types/api";

import {
  Container,
  Text,
  TextContainer,
  Time,
} from "./ModerationReviewBanner.styled";

const ICON_BUTTON_SIZE = 16;

const mapStateToProps = (state: any, _props: any) => ({
  currentUser: getUser(state),
});

interface ModerationReviewBannerProps {
  moderationReview: ModerationReview;
  user?: User | null;
  currentUser: User;
  onRemove?: () => void;
  className?: string;
}

export const ModerationReviewBanner = ({
  moderationReview,
  user: moderator = null,
  currentUser,
  className,
}: ModerationReviewBannerProps) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Users.load({
    id: (_state: any, props: any) => props.moderationReview.moderator_id,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ModerationReviewBanner);
