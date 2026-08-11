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
 *
 * The route shape stays eager, so matching is unchanged. The availability gates
 * above them still decide what renders, but they now decide a tick later: the
 * router resolves a matched route's `lazy` before it commits, which means a page
 * a gate is about to block is fetched anyway. That is a few tens of kilobytes on
 * an admin page whose feature is switched off, in exchange for one splitting
 * mechanism across the app.
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

const mcpAnalyticsPage = () =>
  import("./mcp-analytics/components/McpAnalyticsPage").then(
    ({ McpAnalyticsPage }) => ({ Component: McpAnalyticsPage }),
  );

const cliAnalyticsPage = () =>
  import("./cli-analytics/components/CliAnalyticsPage").then(
    ({ CliAnalyticsPage }) => ({ Component: CliAnalyticsPage }),
  );

/**
 * Hovering a Monitor sidebar link starts the fetch, so the chunk is usually in
 * hand by the time the click lands.
 *
 * `/usage` renders the stats page or the upsell page depending on the license,
 * so hovering it asks for both. The conversation detail page takes the trailing
 * slash, which keeps the link to the list from dragging it in as well.
 */
registerPagePrefetch(Urls.monitorAiAuditingUsage(), conversationStatsPage);
registerPagePrefetch(Urls.monitorAiAuditingUsage(), metabotAnalyticsUpsellPage);
registerPagePrefetch(Urls.monitorAiAuditingConversations(), conversationsPage);
registerPagePrefetch(
  `${Urls.monitorAiAuditingConversations()}/`,
  conversationDetailPage,
);
registerPagePrefetch(Urls.monitorAiAuditingMcp(), mcpAnalyticsPage);
registerPagePrefetch(Urls.monitorAiAuditingCli(), cliAnalyticsPage);

export function getAiAuditingRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route element={<MetabotAnalyticsAvailabilityLayout />}>
        <Route path="usage" lazy={conversationStatsPage} />
        <Route path="conversations" lazy={conversationsPage} />
        <Route path="conversations/:convoId" lazy={conversationDetailPage} />
      </Route>
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" lazy={mcpAnalyticsPage} />
      </Route>
      <Route path="cli" lazy={cliAnalyticsPage} />
    </>
  );
}

export function getAiAuditingUpsellRoutes() {
  return (
    <>
      <Route index element={redirect("usage")} />
      <Route path="usage" lazy={metabotAnalyticsUpsellPage} />
      <Route element={<McpAnalyticsAvailabilityLayout />}>
        <Route path="mcp" lazy={mcpAnalyticsPage} />
      </Route>
      <Route path="cli" lazy={cliAnalyticsPage} />
    </>
  );
}
