import React, { useState } from "react";
import PropTypes from "prop-types";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/questions/components/QuestionActionButtons";
import { PLUGIN_MODERATION_COMPONENTS } from "metabase/plugins";

const {
  active: isPluginActive,
  ModerationIssueActionMenu,
} = PLUGIN_MODERATION_COMPONENTS;

const VIEW = {
  CREATE_ISSUE: "CREATE_ISSUE",
};

function QuestionSidebarView(props) {
  const [view, setView] = useState({
    name: undefined,
    props: undefined,
  });
  const { name, props: viewProps } = view;

  switch (name) {
    case VIEW.CREATE_ISSUE:
      return <div />;
    default:
      return <QuestionDetailsSidebar {...props} setView={setView} />;
  }
}

function QuestionDetailsSidebar({ setView, question, onOpenModal }) {
  const canWrite = question && question.canWrite();

  return (
    <SidebarContent className="full-height px1">
      {isPluginActive ? (
        <div>
          <QuestionActionButtons
            canWrite={canWrite}
            onOpenModal={onOpenModal}
          />
          <ModerationIssueActionMenu
            onAction={issueType => {
              setView({
                name: VIEW.CREATE_ISSUE,
                props: { issueType },
              });
            }}
          />
        </div>
      ) : (
        <div>
          <QuestionActionButtons
            canWrite={canWrite}
            onOpenModal={onOpenModal}
          />
        </div>
      )}
    </SidebarContent>
  );
}

QuestionDetailsSidebar.propTypes = {
  setView: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

export default QuestionSidebarView;
