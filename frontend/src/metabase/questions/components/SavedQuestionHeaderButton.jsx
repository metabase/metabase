import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import cx from "classnames";

import Button from "metabase/components/Button";

import { PLUGIN_MODERATION_SERVICE } from "metabase/plugins";
const { getStatusIconForReview } = PLUGIN_MODERATION_SERVICE;

const StyledButton = styled(Button)`
  font-size: 1.25rem;
  border: none;
  padding: 0.25rem 0.25rem;

  .Icon-chevrondown {
    height: 13px;
  }
`;

function SavedQuestionHeaderButton({ className, question, onClick, active }) {
  const latestModerationReview = question.getLatestModerationReview();
  const { icon } = getStatusIconForReview(latestModerationReview);

  return (
    <StyledButton
      className={cx(className)}
      onClick={onClick}
      iconRight="chevrondown"
      icon={icon}
      active={active}
      iconSize={20}
      data-testid="saved-question-header-button"
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
