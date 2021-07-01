import React from "react";
import PropTypes from "prop-types";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/questions/components/QuestionActionButtons";
import QuestionActivityTimeline from "metabase/questions/components/QuestionActivityTimeline";
import { ClampedDescription } from "metabase/questions/components/ClampedDescription";

import { SidebarContentContainer } from "./QuestionDetailsSidebarPanel.styled";

QuestionDetailsSidebarPanel.propTypes = {
  setView: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({ setView, question, onOpenModal }) {
  const canWrite = question.canWrite();
  const description = question.description();

  return (
    <SidebarContent>
      <SidebarContentContainer>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
        <ClampedDescription
          description={description}
          visibleLines={8}
          onEdit={() => onOpenModal("edit")}
        />
        <QuestionActivityTimeline question={question} />
      </SidebarContentContainer>
    </SidebarContent>
  );
}

export default QuestionDetailsSidebarPanel;
