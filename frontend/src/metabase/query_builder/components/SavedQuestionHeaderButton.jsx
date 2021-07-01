import React from "react";
import PropTypes from "prop-types";

import { HeaderButton } from "./SavedQuestionHeaderButton.styled";

export default SavedQuestionHeaderButton;

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
  active: PropTypes.bool,
};

function SavedQuestionHeaderButton({ className, question, onClick, active }) {
  return (
    <HeaderButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      active={active}
      iconSize={20}
      data-testid="saved-question-header-button"
    >
      {question.displayName()}
    </HeaderButton>
  );
}
