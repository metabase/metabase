import { t } from "ttag";
import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import { QuestionsAuditTable } from "../containers/QuestionsAuditTable";

import * as QueriesCards from "../lib/cards/queries";

const AuditQuestions = props => (
  <AuditContent {...props} title={t`Questions`} tabs={AuditQuestions.tabs} />
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

AuditQuestions.tabs = [
  {
    path: "overview",
    title: t`Overview`,
    component: AuditQuestionsOverviewTab,
  },
  { path: "all", title: t`All questions`, component: QuestionsAuditTable },
];

export default AuditQuestions;
