import { Route, withRouteProps } from "metabase/router";

import { ConversationDetailPage } from "./components/ConversationDetailPage";
import { ConversationStatsPage } from "./components/ConversationStatsPage";
import { ConversationsPage } from "./components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

const RoutedConversationStatsPage = withRouteProps(ConversationStatsPage);
const RoutedConversationsPage = withRouteProps(ConversationsPage);
const RoutedConversationDetailPage = withRouteProps(ConversationDetailPage);

export function getAiAnalyticsRoutes() {
  return (
    <Route key="usage-auditing" path="usage-auditing">
      <Route index element={<RoutedConversationStatsPage />} />
      <Route path="conversations" element={<RoutedConversationsPage />} />
      <Route
        path="conversations/:convoId"
        element={<RoutedConversationDetailPage />}
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
