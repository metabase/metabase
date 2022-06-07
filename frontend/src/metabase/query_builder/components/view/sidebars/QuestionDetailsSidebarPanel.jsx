import React from "react";
import PropTypes from "prop-types";

import QuestionActionButtons from "metabase/query_builder/components/QuestionActionButtons";

import {
  Container,
  SidebarPaddedContent,
} from "./QuestionDetailsSidebarPanel.styled";

QuestionDetailsSidebarPanel.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  isBookmarked: PropTypes.bool.isRequired,
  toggleBookmark: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({
  question,
  onOpenModal,
  isBookmarked,
  toggleBookmark,
}) {
  const canWrite = question.canWrite();
  return (
    <Container>
      <SidebarPaddedContent>
        <QuestionActionButtons
          question={question}
          canWrite={canWrite}
          onOpenModal={onOpenModal}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
        />
      </SidebarPaddedContent>
    </Container>
  );
}

export default QuestionDetailsSidebarPanel;
