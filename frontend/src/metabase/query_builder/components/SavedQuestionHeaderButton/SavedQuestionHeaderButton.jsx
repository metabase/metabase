import React from "react";
import PropTypes from "prop-types";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { HeaderButton } from "./SavedQuestionHeaderButton.styled";

export default SavedQuestionHeaderButton;

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
  isActive: PropTypes.bool.isRequired,
};

function SavedQuestionHeaderButton({ className, question, onClick, isActive }) {
  const {
    name: reviewIconName,
    color: reviewIconColor,
  } = PLUGIN_MODERATION.getStatusIconForQuestion(question);

  return (
    <HeaderButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      icon={reviewIconName}
      leftIconColor={reviewIconColor}
      isActive={isActive}
      iconSize={20}
      data-testid="saved-question-header-button"
    >
      {question.displayName()}
    </HeaderButton>
  );
}
