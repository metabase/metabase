import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";

import { color, lighten } from "metabase/lib/colors";
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
  IconButton,
} from "./ModerationReviewBanner.styled";
import Tooltip from "metabase/components/Tooltip";

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
});

export default _.compose(
  User.load({ id: (state, props) => props.moderationReview.moderator_id }),
  connect(mapStateToProps),
)(ModerationReviewBanner);

ModerationReviewBanner.propTypes = {
  moderationReview: PropTypes.object.isRequired,
  user: PropTypes.object,
  currentUser: PropTypes.object.isRequired,
  onRemove: PropTypes.func.isRequired,
};

function ModerationReviewBanner({
  moderationReview,
  user: moderator,
  currentUser,
  onRemove,
}) {
  const [isHovering, setIsHovering] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  const { bannerText, tooltipText } = getTextForReviewBanner(
    moderationReview,
    moderator,
    currentUser,
  );
  const relativeCreationTime = getRelativeTime(moderationReview.created_at);
  const { icon, iconColor } = getIconForReview(moderationReview);
  const showClose = isHovering || isActive;

  return (
    <Container
      backgroundColor={lighten(iconColor)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Tooltip tooltip={tooltipText}>
        <IconButton
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          icon={showClose ? "close" : icon}
          color={color(showClose ? "text-medium" : iconColor)}
          onClick={onRemove}
        />
      </Tooltip>
      <Text>{bannerText}</Text>
      <Time dateTime={moderationReview.created_at}>{relativeCreationTime}</Time>
    </Container>
  );
}
