import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";

import { color, alpha } from "metabase/lib/colors";
import { getUser } from "metabase/selectors/user";
import { getRelativeTimeAbbreviated } from "metabase/lib/time";
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

const ICON_BUTTON_SIZE = 20;
const TOOLTIP_X_OFFSET = ICON_BUTTON_SIZE / 4;

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
  const relativeCreationTime = getRelativeTimeAbbreviated(
    moderationReview.created_at,
  );
  const { name: iconName, color: iconColor } = getIconForReview(
    moderationReview,
  );
  const showClose = isHovering || isActive;

  return (
    <Container
      backgroundColor={alpha(iconColor, 0.2)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Tooltip
        targetOffsetX={TOOLTIP_X_OFFSET}
        tooltip={onRemove && tooltipText}
      >
        {onRemove ? (
          <IconButton
            data-testid="moderation-remove-review-action"
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            icon={showClose ? "close" : iconName}
            color={color(showClose ? "text-medium" : iconColor)}
            onClick={onRemove}
            iconSize={ICON_BUTTON_SIZE}
          />
        ) : (
          <StatusIcon
            name={iconName}
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
