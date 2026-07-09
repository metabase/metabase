import { IndexRoute, Route } from "metabase/router";

import { ConversationDetailPage } from "./components/ConversationDetailPage";
import { ConversationStatsPage } from "./components/ConversationStatsPage";
import { ConversationsPage } from "./components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

export function getUsageAuditingRoutes() {
  return [
    <Route key="stats" path="stats" component={ConversationStatsPage} />,
    <Route key="conversations" path="conversations">
      <IndexRoute component={ConversationsPage} />
      <Route path=":convoId" component={ConversationDetailPage} />
    </Route>,
  ];
}

export function getUsageAuditingUpsellRoutes() {
  return [
    <Route key="stats" path="stats" component={MetabotAnalyticsUpsellPage} />,
    <Route
      key="conversations"
      path="conversations"
      component={MetabotAnalyticsUpsellPage}
    />,
  ];
}
