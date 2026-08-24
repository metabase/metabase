import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";

/**
 * The AI auditing pages, in one chunk. Every loader names it, so moving between
 * usage, conversations, MCP and CLI does not cost a fetch each time.
 *
 * The plugin registry assigns these routes on every page load, so whatever they
 * name is in the initial bundle. The pages carry the charting and data grid
 * stack, which no other page needs on first paint.
 */
const conversationStatsPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./metabot-analytics/components/ConversationStatsPage"
  ).then(({ ConversationStatsPage }) => ({ Component: ConversationStatsPage }));

const conversationsPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./metabot-analytics/components/ConversationsPage"
  ).then(({ ConversationsPage }) => ({ Component: ConversationsPage }));

const conversationDetailPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./metabot-analytics/components/ConversationDetailPage"
  ).then(({ ConversationDetailPage }) => ({
    Component: ConversationDetailPage,
  }));

const metabotAnalyticsUpsellPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage"
  ).then(({ MetabotAnalyticsUpsellPage }) => ({
    Component: MetabotAnalyticsUpsellPage,
  }));

const mcpAnalyticsSectionLayout = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./mcp-analytics/components/McpAnalyticsSectionLayout"
  ).then(({ McpAnalyticsSectionLayout }) => ({
    Component: McpAnalyticsSectionLayout,
  }));

const mcpUsagePage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./mcp-analytics/components/McpUsagePage"
  ).then(({ McpUsagePage }) => ({
    Component: McpUsagePage,
  }));

const mcpEventsPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./mcp-analytics/components/McpEventsPage"
  ).then(({ McpEventsPage }) => ({ Component: McpEventsPage }));

const cliAnalyticsSectionLayout = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./cli-analytics/components/CliAnalyticsSectionLayout"
  ).then(({ CliAnalyticsSectionLayout }) => ({
    Component: CliAnalyticsSectionLayout,
  }));

const cliUsagePage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./cli-analytics/components/CliUsagePage"
  ).then(({ CliUsagePage }) => ({
    Component: CliUsagePage,
  }));

const cliCallsPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./cli-analytics/components/CliCallsPage"
  ).then(({ CliCallsPage }) => ({
    Component: CliCallsPage,
  }));

/**
 * Hovering a Monitor sidebar link starts the fetch, so the chunk is usually in
 * hand by the time the click lands. These pages share a chunk, so the first
 * hover covers the whole section.
 */
registerPagePrefetch(Urls.monitorAiAuditingUsage(), conversationStatsPage);
registerPagePrefetch(Urls.monitorAiAuditingUsage(), metabotAnalyticsUpsellPage);
registerPagePrefetch(Urls.monitorAiAuditingConversations(), conversationsPage);
registerPagePrefetch(
  `${Urls.monitorAiAuditingConversations()}/`,
  conversationDetailPage,
);
registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpAnalyticsSectionLayout);
registerPagePrefetch(Urls.monitorAiAuditingCli(), cliAnalyticsSectionLayout);

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
