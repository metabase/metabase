import React from "react";
import PropTypes from "prop-types";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/query_builder/components/QuestionActionButtons";
import { ClampedDescription } from "metabase/query_builder/components/ClampedDescription";
import {
  SidebarContentContainer,
  BorderedQuestionActivityTimeline,
} from "./QuestionDetailsSidebarPanel.styled";
import { PLUGIN_MODERATION } from "metabase/plugins";

const { QuestionModerationSection } = PLUGIN_MODERATION;

export default QuestionDetailsSidebarPanel;

QuestionDetailsSidebarPanel.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  moderatorVerifyCard: PropTypes.func.isRequired,
  removeModerationReview: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({
  question,
  onOpenModal,
  moderatorVerifyCard,
  removeModerationReview,
}) {
  const canWrite = question.canWrite();
  const description = question.description();

  const onDescriptionEdit = canWrite
    ? () => {
        onOpenModal("edit");
      }
    : undefined;

  return (
    <SidebarContent>
      <SidebarContentContainer>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
        <ClampedDescription
          className="pb2"
          visibleLines={8}
          description={description}
          onEdit={onDescriptionEdit}
        />
        <QuestionModerationSection question={question} />
        <BorderedQuestionActivityTimeline question={question} />
      </SidebarContentContainer>
    </SidebarContent>
  );
}
