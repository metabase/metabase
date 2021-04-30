import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";

import Button from "metabase/components/Button";

import { PLUGIN_MODERATION_SERVICE } from "metabase/plugins";
const { getModerationStatusIcon } = PLUGIN_MODERATION_SERVICE;

const StyledButton = styled(Button)`
  font-size: 1.25rem;
  border: none;
  padding: 0.5rem 0.25rem;

  .Icon-chevrondown {
    height: 20px;
  }
`;

function SavedQuestionHeaderButton({ className, question, onClick, active }) {
  const latestModerationReview = question.getLatestModerationReview();
  return (
    <StyledButton
      className={className}
      onClick={onClick}
      iconRight="chevrondown"
      icon={
        latestModerationReview &&
        getModerationStatusIcon(latestModerationReview.status)
      }
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
