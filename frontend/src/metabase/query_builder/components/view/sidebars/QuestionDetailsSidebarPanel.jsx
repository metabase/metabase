import React from "react";
import PropTypes from "prop-types";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/questions/components/QuestionActionButtons";
import ClampedText from "metabase/components/ClampedText";
import { PLUGIN_MODERATION_COMPONENTS } from "metabase/plugins";
import { SIDEBAR_VIEWS } from "./constants";

const { ModerationIssueActionMenu } = PLUGIN_MODERATION_COMPONENTS;

function QuestionDetailsSidebarPanel({ setView, question, onOpenModal }) {
  const canWrite = question.canWrite();
  const description = question.description();

  return (
    <SidebarContent className="full-height px1">
      <div>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
        <ClampedText className="pb2 px2" text={description} visibleLines={8} />
        <ModerationIssueActionMenu
          onAction={issueType => {
            setView({
              name: SIDEBAR_VIEWS.CREATE_ISSUE_PANEL,
              props: { issueType },
            });
          }}
        />
      </div>
    </SidebarContent>
  );
}

QuestionDetailsSidebarPanel.propTypes = {
  setView: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

export default QuestionDetailsSidebarPanel;
