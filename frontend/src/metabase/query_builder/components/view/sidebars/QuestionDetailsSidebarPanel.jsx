import React from "react";
import PropTypes from "prop-types";
import QuestionActionButtons from "metabase/questions/components/QuestionActionButtons";
import QuestionActivityTimeline from "metabase/questions/components/QuestionActivityTimeline";
import { ClampedDescription } from "metabase/questions/components/ClampedDescription";

import {
  SidebarOuterContainer,
  SidebarInnerContainer,
} from "./QuestionDetailsSidebarPanel.styled";

QuestionDetailsSidebarPanel.propTypes = {
  setView: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({ setView, question, onOpenModal }) {
  const canWrite = question.canWrite();
  const description = question.description();

  return (
    <SidebarOuterContainer>
      <SidebarInnerContainer>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
        <ClampedDescription
          description={description}
          visibleLines={8}
          onEdit={() => onOpenModal("edit")}
        />
        <QuestionActivityTimeline question={question} />
      </SidebarInnerContainer>
    </SidebarOuterContainer>
  );
}

export default QuestionDetailsSidebarPanel;
