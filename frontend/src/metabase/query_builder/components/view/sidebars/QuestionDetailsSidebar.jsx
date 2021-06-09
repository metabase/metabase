import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { withRouter } from "react-router";
import _ from "underscore";

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
  createModerationRequestComment: PropTypes.func.isRequired,
  updateModerationRequest: PropTypes.func.isRequired,
  router: PropTypes.object.isRequired,
};

function QuestionDetailsSidebar({
  question,
  onOpenModal,
  createModerationReview,
  createModerationRequest,
  createModerationRequestComment,
  updateModerationRequest,
  router,
}) {
  const initialView = parseViewFromQueryParams(router.location.query, question);
  const [view, setView] = useState(initialView);
  const { name, props: viewProps } = view;
  const id = question.id();
  const comments = question.getComments();

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

  const onComment = (text, moderationRequest) => {
    return createModerationRequestComment({
      text,
      moderationRequestId: moderationRequest.id,
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
          comments={comments}
          onReturn={onReturn}
          onModerate={onModerate}
          onComment={onComment}
          updateModerationRequest={updateModerationRequest}
        />
      );
    case SIDEBAR_VIEWS.MODERATION_REQUEST_PANEL:
      return (
        <ModerationRequestsPanel
          requests={findRequest(viewProps.requestId, question)}
          comments={comments}
          onReturn={onReturn}
          onModerate={onModerate}
          onComment={onComment}
          updateModerationRequest={updateModerationRequest}
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

export default withRouter(QuestionDetailsSidebar);

function findRequest(requestId, question) {
  const requests = question.getModerationRequests();
  const request = _.findWhere(requests, {
    id: requestId,
  });

  // `request` might not exist if the previous `question` stored in state hasn't yet been replaced
  return request ? [request] : [];
}

function parseViewFromQueryParams(queryParams = {}, question) {
  if (queryParams.moderationRequest) {
    return {
      name: SIDEBAR_VIEWS.MODERATION_REQUEST_PANEL,
      props: {
        requestId: Number(queryParams.moderationRequest),
      },
      previousView: undefined,
    };
  }

  return {
    name: undefined,
    props: undefined,
    previousView: undefined,
  };
}
