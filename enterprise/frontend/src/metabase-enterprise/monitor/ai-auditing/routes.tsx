import { Route, redirect, withRouteProps } from "metabase/router";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AiAuditingAvailabilityLayout";
import { McpAnalyticsPage } from "./mcp-analytics/components/McpAnalyticsPage";
import { ConversationDetailPage } from "./metabot-analytics/components/ConversationDetailPage";
import { ConversationStatsPage } from "./metabot-analytics/components/ConversationStatsPage";
import { ConversationsPage } from "./metabot-analytics/components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

const RoutedConversationStatsPage = withRouteProps(ConversationStatsPage);
const RoutedConversationsPage = withRouteProps(ConversationsPage);
const RoutedConversationDetailPage = withRouteProps(ConversationDetailPage);
const RoutedMcpAnalyticsPage = withRouteProps(McpAnalyticsPage);

export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route element={<MetabotAnalyticsAvailabilityLayout />}>
        <Route path="usage" element={<RoutedConversationStatsPage />} />
        <Route path="conversations" element={<RoutedConversationsPage />} />
        <Route
          path="conversations/:convoId"
          element={<RoutedConversationDetailPage />}
        />
      </Route>
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" element={<RoutedMcpAnalyticsPage />} />
      </Route>
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route path="usage" element={<MetabotAnalyticsUpsellPage />} />
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" element={<RoutedMcpAnalyticsPage />} />
      </Route>
    </>
  );
}
