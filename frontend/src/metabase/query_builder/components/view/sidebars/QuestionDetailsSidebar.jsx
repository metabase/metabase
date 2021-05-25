import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import { SIDEBAR_VIEWS } from "./constants";
const {
  CreateModerationIssuePanel,
  ModerationRequestsPanel,
} = PLUGIN_MODERATION_COMPONENTS;

const { getOpenRequests } = PLUGIN_MODERATION_SERVICE;

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
  createModerationRequest: PropTypes.func.isRequired,
};

function QuestionDetailsSidebar({
  question,
  onOpenModal,
  createModerationReview,
  createModerationRequest,
}) {
  const [view, setView] = useState({
    name: undefined,
    props: undefined,
    previousView: undefined,
  });
  const { name, props: viewProps } = view;
  const id = question.id();

  const onReturn = () =>
    setView(({ previousView }) => ({
      name: previousView || SIDEBAR_VIEWS.DETAILS,
    }));

  const onModerate = (moderationReviewType, moderationRequest) => {
    setView({
      name: SIDEBAR_VIEWS.CREATE_ISSUE_PANEL,
      props: { issueType: moderationReviewType, moderationRequest },
      previousView: SIDEBAR_VIEWS.OPEN_ISSUES_PANEL,
    });
  };

  switch (name) {
    case SIDEBAR_VIEWS.CREATE_ISSUE_PANEL:
      return (
        <CreateModerationIssuePanel
          {...viewProps}
          onReturn={onReturn}
          createModerationReview={createModerationReview}
          createModerationRequest={createModerationRequest}
          itemId={id}
        />
      );
    case SIDEBAR_VIEWS.OPEN_ISSUES_PANEL:
      return (
        <ModerationRequestsPanel
          returnText={t`Open issues`}
          requests={getOpenRequests(question)}
          onModerate={onModerate}
          onReturn={onReturn}
        />
      );
    case SIDEBAR_VIEWS.MODERATION_REQUEST_PANEL:
      return <ModerationRequestsPanel {...viewProps} onReturn={onReturn} />;
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
