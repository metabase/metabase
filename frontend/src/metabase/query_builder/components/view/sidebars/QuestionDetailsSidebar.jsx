import React, { useState } from "react";
import PropTypes from "prop-types";
import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import { PLUGIN_MODERATION_COMPONENTS } from "metabase/plugins";
import { SIDEBAR_VIEWS } from "./constants";
const { CreateModerationIssuePanel } = PLUGIN_MODERATION_COMPONENTS;

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
};

function QuestionDetailsSidebar({
  question,
  onOpenModal,
  createModerationReview,
}) {
  const [view, setView] = useState({
    name: undefined,
    props: undefined,
  });
  const { name, props: viewProps } = view;
  const id = question.id();

  switch (name) {
    case SIDEBAR_VIEWS.CREATE_ISSUE_PANEL:
      return (
        <CreateModerationIssuePanel
          {...viewProps}
          onCancel={() => setView({ name: SIDEBAR_VIEWS.DETAILS })}
          createModerationReview={createModerationReview}
          itemId={id}
          itemType="card"
        />
      );
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return (
        <QuestionDetailsSidebarPanel
          setView={setView}
          question={question}
          onOpenModal={onOpenModal}
        />
      );
  }
}

export default QuestionDetailsSidebar;
