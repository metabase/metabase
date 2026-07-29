import { Route, redirect } from "metabase/router";

import { CliAnalyticsPage } from "./cli-analytics/components/CliAnalyticsPage";
import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";
import { McpAnalyticsPage } from "./mcp-analytics/components/McpAnalyticsPage";
import { ConversationDetailPage } from "./metabot-analytics/components/ConversationDetailPage";
import { ConversationStatsPage } from "./metabot-analytics/components/ConversationStatsPage";
import { ConversationsPage } from "./metabot-analytics/components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route element={<MetabotAnalyticsAvailabilityLayout />}>
        <Route path="usage" element={<ConversationStatsPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route
          path="conversations/:convoId"
          element={<ConversationDetailPage />}
        />
      </Route>
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" element={<McpAnalyticsPage />} />
      </Route>
      <Route path="cli" element={<CliAnalyticsPage />} />
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route path="usage" element={<MetabotAnalyticsUpsellPage />} />
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" element={<McpAnalyticsPage />} />
      </Route>
      <Route path="cli" element={<CliAnalyticsPage />} />
    </>
  );
}
