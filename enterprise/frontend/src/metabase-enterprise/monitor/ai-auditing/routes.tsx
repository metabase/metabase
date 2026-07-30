import { Route, redirect } from "metabase/router";

import { CliAnalyticsSectionLayout } from "./cli-analytics/components/CliAnalyticsSectionLayout";
import { CliCallsPage } from "./cli-analytics/components/CliCallsPage";
import { CliUsagePage } from "./cli-analytics/components/CliUsagePage";
import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";
import { McpAnalyticsSectionLayout } from "./mcp-analytics/components/McpAnalyticsSectionLayout";
import { McpEventsPage } from "./mcp-analytics/components/McpEventsPage";
import { McpUsagePage } from "./mcp-analytics/components/McpUsagePage";
import { ConversationDetailPage } from "./metabot-analytics/components/ConversationDetailPage";
import { ConversationStatsPage } from "./metabot-analytics/components/ConversationStatsPage";
import { ConversationsPage } from "./metabot-analytics/components/ConversationsPage";
import { MetabotAnalyticsUpsellPage } from "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage";

// The index redirects sit outside the section layouts: the layouts only render their `<Outlet />`
// once the shared "has any data" query resolves with rows, so an index route nested inside one
// would never fire on an empty, still-loading, or errored section and the bare path would stick.
function getMcpAnalyticsRoutes() {
  return (
    <Route element={<McpAnalyticsAvailabilityLayout />}>
      <Route path="mcp">
        <Route index element={redirect("usage")} />
        <Route element={<McpAnalyticsSectionLayout />}>
          <Route path="usage" element={<McpUsagePage />} />
          <Route path="events" element={<McpEventsPage />} />
        </Route>
      </Route>
    </Route>
  );
}

function getCliAnalyticsRoutes() {
  return (
    <Route path="cli">
      <Route index element={redirect("usage")} />
      <Route element={<CliAnalyticsSectionLayout />}>
        <Route path="usage" element={<CliUsagePage />} />
        <Route path="calls" element={<CliCallsPage />} />
      </Route>
    </Route>
  );
}

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
      {getMcpAnalyticsRoutes()}
      {getCliAnalyticsRoutes()}
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route path="usage" element={<MetabotAnalyticsUpsellPage />} />
      {getMcpAnalyticsRoutes()}
      {getCliAnalyticsRoutes()}
    </>
  );
}
