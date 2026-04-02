import { IndexRoute, Route } from "react-router";

import { ConversationDetailPage } from "./components/ConversationDetailPage";
import { ConversationStatsPage } from "./components/ConversationStatsPage";
import { ConversationsPage } from "./components/ConversationsPage";
import { MetabotStatsLayout } from "./components/MetabotStatsLayout";

export function getMetabotAnalyticsRoutes() {
  return (
    <Route key="usage-stats" path="usage-stats" component={MetabotStatsLayout}>
      <IndexRoute component={ConversationStatsPage} />
      <Route path="conversations" component={ConversationsPage} />
      <Route path="conversations/:convoId" component={ConversationDetailPage} />
    </Route>
  );
}
