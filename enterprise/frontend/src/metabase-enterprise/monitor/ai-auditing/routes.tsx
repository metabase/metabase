import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";

/**
 * The AI auditing pages, each in its own chunk.
 *
 * The plugin registry assigns these routes on every page load, so whatever they
 * name is in the initial bundle. The pages carry the charting and data grid
 * stack, which no other page needs on first paint.
 */
const conversationStatsPage = () =>
  import("./metabot-analytics/components/ConversationStatsPage").then(
    ({ ConversationStatsPage }) => ({ Component: ConversationStatsPage }),
  );

const conversationsPage = () =>
  import("./metabot-analytics/components/ConversationsPage").then(
    ({ ConversationsPage }) => ({ Component: ConversationsPage }),
  );

const conversationDetailPage = () =>
  import("./metabot-analytics/components/ConversationDetailPage").then(
    ({ ConversationDetailPage }) => ({ Component: ConversationDetailPage }),
  );

const metabotAnalyticsUpsellPage = () =>
  import("./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage").then(
    ({ MetabotAnalyticsUpsellPage }) => ({
      Component: MetabotAnalyticsUpsellPage,
    }),
  );

const mcpAnalyticsSectionLayout = () =>
  import("./mcp-analytics/components/McpAnalyticsSectionLayout").then(
    ({ McpAnalyticsSectionLayout }) => ({
      Component: McpAnalyticsSectionLayout,
    }),
  );

const mcpUsagePage = () =>
  import("./mcp-analytics/components/McpUsagePage").then(
    ({ McpUsagePage }) => ({
      Component: McpUsagePage,
    }),
  );

const mcpEventsPage = () =>
  import("./mcp-analytics/components/McpEventsPage").then(
    ({ McpEventsPage }) => ({ Component: McpEventsPage }),
  );

const cliAnalyticsSectionLayout = () =>
  import("./cli-analytics/components/CliAnalyticsSectionLayout").then(
    ({ CliAnalyticsSectionLayout }) => ({
      Component: CliAnalyticsSectionLayout,
    }),
  );

const cliUsagePage = () =>
  import("./cli-analytics/components/CliUsagePage").then(
    ({ CliUsagePage }) => ({
      Component: CliUsagePage,
    }),
  );

const cliCallsPage = () =>
  import("./cli-analytics/components/CliCallsPage").then(
    ({ CliCallsPage }) => ({
      Component: CliCallsPage,
    }),
  );

/**
 * Hovering a Monitor sidebar link starts the fetch, so the chunk is usually in
 * hand by the time the click lands.
 *
 * `/usage` renders the stats page or the upsell page depending on the license,
 * so hovering it asks for both. Section links prefetch their shared layout and
 * default usage page; nested links prefetch their matching leaf page.
 */
registerPagePrefetch(Urls.monitorAiAuditingUsage(), conversationStatsPage);
registerPagePrefetch(Urls.monitorAiAuditingUsage(), metabotAnalyticsUpsellPage);
registerPagePrefetch(Urls.monitorAiAuditingConversations(), conversationsPage);
registerPagePrefetch(
  `${Urls.monitorAiAuditingConversations()}/`,
  conversationDetailPage,
);
registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpAnalyticsSectionLayout);
registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpUsagePage);
registerPagePrefetch(
  Urls.monitorAiAuditingMcpUsage(),
  mcpAnalyticsSectionLayout,
);
registerPagePrefetch(Urls.monitorAiAuditingMcpUsage(), mcpUsagePage);
registerPagePrefetch(
  Urls.monitorAiAuditingMcpEvents(),
  mcpAnalyticsSectionLayout,
);
registerPagePrefetch(Urls.monitorAiAuditingMcpEvents(), mcpEventsPage);
registerPagePrefetch(Urls.monitorAiAuditingCli(), cliAnalyticsSectionLayout);
registerPagePrefetch(Urls.monitorAiAuditingCli(), cliUsagePage);
registerPagePrefetch(
  Urls.monitorAiAuditingCliUsage(),
  cliAnalyticsSectionLayout,
);
registerPagePrefetch(Urls.monitorAiAuditingCliUsage(), cliUsagePage);
registerPagePrefetch(
  Urls.monitorAiAuditingCliCalls(),
  cliAnalyticsSectionLayout,
);
registerPagePrefetch(Urls.monitorAiAuditingCliCalls(), cliCallsPage);

function getMcpAnalyticsRoutes() {
  return (
    <Route element={<McpAnalyticsAvailabilityLayout />}>
      <Route path="mcp">
        <Route index element={redirect("usage")} />
        <Route lazy={mcpAnalyticsSectionLayout}>
          <Route path="usage" lazy={mcpUsagePage} />
          <Route path="events" lazy={mcpEventsPage} />
        </Route>
      </Route>
    </Route>
  );
}

function getCliAnalyticsRoutes() {
  return (
    <Route path="cli">
      <Route index element={redirect("usage")} />
      <Route lazy={cliAnalyticsSectionLayout}>
        <Route path="usage" lazy={cliUsagePage} />
        <Route path="calls" lazy={cliCallsPage} />
      </Route>
    </Route>
  );
}

export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route element={<MetabotAnalyticsAvailabilityLayout />}>
        <Route path="usage" lazy={conversationStatsPage} />
        <Route path="conversations" lazy={conversationsPage} />
        <Route path="conversations/:convoId" lazy={conversationDetailPage} />
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
      <Route path="usage" lazy={metabotAnalyticsUpsellPage} />
      {getMcpAnalyticsRoutes()}
      {getCliAnalyticsRoutes()}
    </>
  );
}
