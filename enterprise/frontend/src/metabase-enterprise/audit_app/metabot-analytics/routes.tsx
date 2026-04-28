import { IndexRoute, Route } from "react-router";

import { ConversationDetailPage } from "./components/ConversationDetailPage";
import { ConversationStatsPage } from "./components/ConversationStatsPage";
import { ConversationsPage } from "./components/ConversationsPage";

export function getAiAnalyticsRoutes() {
  return (
    <Route key="usage-auditing" path="usage-auditing">
      <IndexRoute component={ConversationStatsPage} />
      <Route path="conversations" component={ConversationsPage} />
      <Route path="conversations/:convoId" component={ConversationDetailPage} />
    </Route>
  );
}
