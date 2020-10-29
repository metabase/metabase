/* @flow */

import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as QueriesCards from "../lib/cards/queries";

type Props = {
  params: { [key: string]: string },
};

const AuditQuestions = (props: Props) => (
  <AuditContent {...props} title="Questions" tabs={AuditQuestions.tabs} />
);

const AuditQuestionsOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 9, h: 9 }, QueriesCards.mostPopular()],
      [{ x: 9, y: 0, w: 9, h: 9 }, QueriesCards.slowest()],
      [
        { x: 0, y: 9, w: 18, h: 6 },
        QueriesCards.viewsAndAvgExecutionTimeByDay(),
      ],
    ]}
  />
);

const AuditQuestionsAllTab = () => (
  <AuditTableWithSearch
    placeholder={`Question name`}
    table={QueriesCards.table()}
  />
);

AuditQuestions.tabs = [
  { path: "overview", title: "Overview", component: AuditQuestionsOverviewTab },
  { path: "all", title: "All questions", component: AuditQuestionsAllTab },
];

export default AuditQuestions;
