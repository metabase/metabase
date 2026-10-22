import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";

/**
 * The AI auditing pages, in one chunk. Every loader names it, so moving between
 * usage, conversations, MCP, CLI and data apps does not cost a fetch each time.
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

const dataAppsAnalyticsPage = () =>
  import(
    /* webpackChunkName: "ai-auditing" */ "./data-apps-analytics/components/DataAppsAnalyticsPage"
  ).then(({ DataAppsAnalyticsPage }) => ({
    Component: DataAppsAnalyticsPage,
  }));

/**
 * Hovering a Monitor sidebar link starts the fetch, so the chunk is usually in
 * hand by the time the click lands. These pages share a chunk, so the first
 * hover covers the whole section.
 *
 * Called from the branch of `initializePlugin` that mounts these routes, so only
 * the pages this instance can reach are registered. The background pass reads the
 * registrations too, and fetching a page nobody can reach would spend a download
 * on nothing.
 */
export function registerAiAuditingPagePrefetch(): void {
  registerPagePrefetch(Urls.monitorAiAuditingUsage(), conversationStatsPage);
  registerPagePrefetch(
    Urls.monitorAiAuditingConversations(),
    conversationsPage,
  );
  registerPagePrefetch(
    `${Urls.monitorAiAuditingConversations()}/`,
    conversationDetailPage,
  );
  registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpAnalyticsSectionLayout);
  registerPagePrefetch(Urls.monitorAiAuditingCli(), cliAnalyticsSectionLayout);
  registerDataAppsAnalyticsPagePrefetch();
}

/** The section as an instance without the license mounts it: usage upsells. */
export function registerAiAuditingUpsellPagePrefetch(): void {
  registerPagePrefetch(
    Urls.monitorAiAuditingUsage(),
    metabotAnalyticsUpsellPage,
  );
  registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpAnalyticsSectionLayout);
  registerPagePrefetch(Urls.monitorAiAuditingCli(), cliAnalyticsSectionLayout);
  registerDataAppsAnalyticsPagePrefetch();
}

// Unconditional: the audit app plugin registers these before the data apps plugin sets
// `PLUGIN_DATA_APPS.isEnabled`, and the page shares the section's chunk, so prefetching it
// costs nothing on an instance that can't open it.
function registerDataAppsAnalyticsPagePrefetch() {
  registerPagePrefetch(Urls.monitorAiAuditingDataApps(), dataAppsAnalyticsPage);
}

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

function getDataAppsAnalyticsRoutes() {
  if (!PLUGIN_DATA_APPS.isEnabled) {
    return null;
  }
  return <Route path="data-apps" lazy={dataAppsAnalyticsPage} />;
}

export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route element={<MetabotAnalyticsAvailabilityLayout />}>
        <Route path="usage">
          <Route index element={redirect("conversations")} />
          <Route path=":metric" lazy={conversationStatsPage} />
        </Route>
        <Route path="conversations" lazy={conversationsPage} />
        <Route path="conversations/:convoId" lazy={conversationDetailPage} />
      </Route>
      {getMcpAnalyticsRoutes()}
      {getCliAnalyticsRoutes()}
      {getDataAppsAnalyticsRoutes()}
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route path="usage/*" lazy={metabotAnalyticsUpsellPage} />
      {getMcpAnalyticsRoutes()}
      {getCliAnalyticsRoutes()}
      {getDataAppsAnalyticsRoutes()}
    </>
  );
}
