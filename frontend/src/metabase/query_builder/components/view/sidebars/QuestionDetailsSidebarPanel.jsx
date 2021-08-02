import React from "react";
import PropTypes from "prop-types";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/query_builder/components/QuestionActionButtons";
import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";
import { ClampedDescription } from "metabase/query_builder/components/ClampedDescription";
import { SidebarContentContainer } from "./QuestionDetailsSidebarPanel.styled";

QuestionDetailsSidebarPanel.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({ question, onOpenModal }) {
  const canWrite = question.canWrite();
  const description = question.description();

  return (
    <SidebarContent>
      <SidebarContentContainer>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
        <ClampedDescription
          description={description}
          visibleLines={8}
          onEdit={canWrite && (() => onOpenModal("edit"))}
        />
        <QuestionActivityTimeline
          className="border-top mt2 pt4"
          question={question}
        />
      </SidebarContentContainer>
    </SidebarContent>
  );
}

export default QuestionDetailsSidebarPanel;
