import React from "react";
import PropTypes from "prop-types";

import { HeaderButton } from "./SavedQuestionHeaderButton.styled";

export default SavedQuestionHeaderButton;

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
  isActive: PropTypes.bool.isRequired,
};

function SavedQuestionHeaderButton({ className, question, onClick, isActive }) {
  return (
    <HeaderButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      isActive={isActive}
      iconSize={20}
      data-testid="saved-question-header-button"
    >
      {question.displayName()}
    </HeaderButton>
  );
}
