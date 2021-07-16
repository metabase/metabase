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
  StatusIcon,
} from "./ModerationReviewBanner.styled";
import Tooltip from "metabase/components/Tooltip";

const ICON_BUTTON_SIZE = 16;
const TOOLTIP_X_OFFSET = ICON_BUTTON_SIZE / 2;

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
  onRemove: PropTypes.func,
};

export function ModerationReviewBanner({
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
      <Tooltip
        targetOffsetX={TOOLTIP_X_OFFSET}
        tooltip={onRemove && tooltipText}
      >
        {onRemove ? (
          <IconButton
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            icon={showClose ? "close" : icon}
            color={color(showClose ? "text-medium" : iconColor)}
            onClick={onRemove}
            size={ICON_BUTTON_SIZE}
          />
        ) : (
          <StatusIcon
            name={icon}
            color={color(iconColor)}
            size={ICON_BUTTON_SIZE}
          />
        )}
      </Tooltip>
      <Text>{bannerText}</Text>
      <Time dateTime={moderationReview.created_at}>{relativeCreationTime}</Time>
    </Container>
  );
}
