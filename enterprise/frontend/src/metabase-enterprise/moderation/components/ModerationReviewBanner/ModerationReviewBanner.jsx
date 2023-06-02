import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";

import { color, alpha } from "metabase/lib/colors";
import { getUser } from "metabase/selectors/user";
import { getRelativeTime } from "metabase/lib/time";
import {
  getTextForReviewBanner,
  getIconForReview,
} from "metabase-enterprise/moderation/service";
import User from "metabase/entities/users";

import {
  Container,
  Text,
  Time,
  TextContainer,
} from "./ModerationReviewBanner.styled";

const ICON_BUTTON_SIZE = 16;

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
});

export default _.compose(
  User.load({
    id: (state, props) => props.moderationReview.moderator_id,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ModerationReviewBanner);

ModerationReviewBanner.propTypes = {
  moderationReview: PropTypes.object.isRequired,
  user: PropTypes.object,
  currentUser: PropTypes.object.isRequired,
  onRemove: PropTypes.func,
  className: PropTypes.func,
};

export function ModerationReviewBanner({
  moderationReview,
  user: moderator,
  currentUser,
  className,
}) {
  const { bannerText } = getTextForReviewBanner(
    moderationReview,
    moderator,
    currentUser,
  );
  const relativeCreationTime = getRelativeTime(moderationReview.created_at);
  const { name: iconName, color: iconColor } =
    getIconForReview(moderationReview);

  return (
    <Container backgroundColor={alpha(iconColor, 0.2)} className={className}>
      <Icon name={iconName} color={color(iconColor)} size={ICON_BUTTON_SIZE} />
      <TextContainer>
        <Text>{bannerText}</Text>
        <Time dateTime={moderationReview.created_at}>
          {relativeCreationTime}
        </Time>
      </TextContainer>
    </Container>
  );
}
