import React from "react";
import PropTypes from "prop-types";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { HeaderButton } from "./SavedQuestionHeaderButton.styled";

const { getIconForReview, getLatestModerationReview } = PLUGIN_MODERATION;

export default SavedQuestionHeaderButton;

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
  isActive: PropTypes.bool.isRequired,
};

function SavedQuestionHeaderButton({ className, question, onClick, isActive }) {
  const latestModerationReview = getLatestModerationReview(
    question.getModerationReviews(),
  );

  const { icon: reviewIcon, iconColor: reviewIconColor } = getIconForReview(
    latestModerationReview,
  );

  return (
    <HeaderButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      icon={reviewIcon}
      leftIconColor={reviewIconColor}
      isActive={isActive}
      iconSize={20}
      data-testid="saved-question-header-button"
    >
      {question.displayName()}
    </HeaderButton>
  );
}
