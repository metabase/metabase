import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";

import Button from "metabase/components/Button";

import { getModerationStatusIcon } from "metabase/lib/moderation";

const StyledButton = styled(Button)`
  font-size: 1.25rem;
  border: none;
  padding: 0.5rem 0.25rem;

  .Icon-chevrondown {
    height: 20px;
  }
`;

function SavedQuestionHeaderButton({ className, question, onClick, active }) {
  // this will shortly become something like `question.getModerationStatus()`
  const moderationStatus = "verification";
  return (
    <StyledButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      icon={getModerationStatusIcon(moderationStatus)}
      active={active}
      iconSize={24}
    >
      {question.displayName()}
    </StyledButton>
  );
}

export default SavedQuestionHeaderButton;

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
  active: PropTypes.bool,
};
