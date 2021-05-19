import React, { useState } from "react";
import PropTypes from "prop-types";
import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import { SIDEBAR_VIEWS } from "./constants";
const {
  CreateModerationIssuePanel,
  OpenModerationIssuesPanel,
} = PLUGIN_MODERATION_COMPONENTS;

const { getOpenRequests } = PLUGIN_MODERATION_SERVICE;

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
  createModerationRequest: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
};

function QuestionDetailsSidebar({
  question,
  onOpenModal,
  createModerationReview,
  createModerationRequest,
  isAdmin,
}) {
  const [view, setView] = useState({
    name: undefined,
    props: undefined,
    previousView: undefined,
  });
  const { name, props: viewProps } = view;
  const id = question.id();
  const setBaseView = () =>
    setView(({ previousView }) => ({
      name: previousView || SIDEBAR_VIEWS.DETAILS,
    }));

  switch (name) {
    case SIDEBAR_VIEWS.CREATE_ISSUE_PANEL:
      return (
        <CreateModerationIssuePanel
          {...viewProps}
          onReturn={setBaseView}
          createModerationReview={createModerationReview}
          createModerationRequest={createModerationRequest}
          itemId={id}
          itemType="card"
          isAdmin={isAdmin}
        />
      );
    case SIDEBAR_VIEWS.OPEN_ISSUES_PANEL:
      return (
        <OpenModerationIssuesPanel
          setView={setView}
          requests={getOpenRequests(question)}
          onReturn={setBaseView}
          isAdmin={isAdmin}
        />
      );
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return (
        <QuestionDetailsSidebarPanel
          setView={setView}
          question={question}
          onOpenModal={onOpenModal}
          isAdmin={isAdmin}
        />
      );
  }
}

export default QuestionDetailsSidebar;
