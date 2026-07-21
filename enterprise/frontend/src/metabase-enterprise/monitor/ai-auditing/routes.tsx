import { Route, withRouteProps } from "metabase/router";

import { McpAnalyticsPage } from "./mcp-analytics/components/McpAnalyticsPage";
import { ConversationDetailPage } from "./metabot-analytics/components/ConversationDetailPage";
import { ConversationStatsPage } from "./metabot-analytics/components/ConversationStatsPage";
import { ConversationsPage } from "./metabot-analytics/components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

const RoutedConversationStatsPage = withRouteProps(ConversationStatsPage);
const RoutedConversationsPage = withRouteProps(ConversationsPage);
const RoutedConversationDetailPage = withRouteProps(ConversationDetailPage);
const RoutedMcpAnalyticsPage = withRouteProps(McpAnalyticsPage);

/**
 * MCP analytics is gated only on `audit_app` (same as the rest of this section), not on
 * `ai_controls` — it stays available in both the real and upsell variants below.
 */
export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={<RoutedConversationStatsPage />} />
      <Route path="conversations" element={<RoutedConversationsPage />} />
      <Route
        path="conversations/:convoId"
        element={<RoutedConversationDetailPage />}
      />
      <Route path="mcp" element={<RoutedMcpAnalyticsPage />} />
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={<MetabotAnalyticsUpsellPage />} />
      <Route path="mcp" element={<RoutedMcpAnalyticsPage />} />
    </>
  );
}
