import { Route } from "metabase/router";

import { ConversationDetailPage } from "./components/ConversationDetailPage";
import { ConversationStatsPage } from "./components/ConversationStatsPage";
import { ConversationsPage } from "./components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

export function getAiAnalyticsRoutes() {
  return (
    <Route key="usage-auditing" path="usage-auditing">
      <Route index element={<ConversationStatsPage />} />
      <Route path="conversations" element={<ConversationsPage />} />
      <Route
        path="conversations/:convoId"
        element={<ConversationDetailPage />}
      />
    </Route>
  );
}

export function getAiAnalyticsUpsellRoutes() {
  return (
    <Route
      key="usage-auditing"
      path="usage-auditing"
      element={<MetabotAnalyticsUpsellPage />}
    />
  );
}
