import React from "react";
import PropTypes from "prop-types";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTable from "../containers/AuditTable";

import OpenInMetabase from "../components/OpenInMetabase";

import Question from "metabase/entities/questions";

import * as Urls from "metabase/lib/urls";

import * as QuestionDetailCards from "../lib/cards/question_detail";

const pagePropTypes = {
  params: PropTypes.shape({
    questionId: PropTypes.string,
  }),
};

function AuditQuestionDetail({ params, ...props }) {
  const questionId = parseInt(params.questionId);
  return (
    <Question.Loader id={questionId} wrapped>
      {({ question }) => (
        <AuditContent
          {...props}
          title={question.getName()}
          subtitle={<OpenInMetabase to={Urls.question(question)} />}
          tabs={AuditQuestionDetail.tabs}
          questionId={questionId}
        />
      )}
    </Question.Loader>
  );
}

AuditQuestionDetail.propTypes = pagePropTypes;

const tabPropTypes = {
  questionId: PropTypes.number,
};

function AuditQuestionActivityTab({ questionId }) {
  return (
    <AuditDashboard
      cards={[
        [
          { x: 0, y: 0, w: 18, h: 10 },
          QuestionDetailCards.viewsByTime(questionId),
        ],
        [
          { x: 0, y: 10, w: 18, h: 10 },
          QuestionDetailCards.averageExecutionTime(questionId),
        ],
      ]}
    />
  );
}

AuditQuestionActivityTab.propTypes = tabPropTypes;

function AuditQuestionRevisionsTab({ questionId }) {
  return <AuditTable table={QuestionDetailCards.revisionHistory(questionId)} />;
}

AuditQuestionRevisionsTab.propTypes = tabPropTypes;

function AuditQuestionAuditLogTab({ questionId }) {
  return <AuditTable table={QuestionDetailCards.auditLog(questionId)} />;
}

AuditQuestionAuditLogTab.propTypes = tabPropTypes;

AuditQuestionDetail.tabs = [
  { path: "activity", title: "Activity", component: AuditQuestionActivityTab },
  { path: "details", title: "Details" },
  {
    path: "revisions",
    title: "Revision history",
    component: AuditQuestionRevisionsTab,
  },
  { path: "log", title: "Audit log", component: AuditQuestionAuditLogTab },
];

export default AuditQuestionDetail;
