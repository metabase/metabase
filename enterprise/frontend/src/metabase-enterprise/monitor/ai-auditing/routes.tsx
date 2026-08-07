import { type ComponentType, Suspense, lazy } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Route, redirect, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./components/AvailabilityLayouts";

/**
 * An AI auditing page, fetched the first time its route renders.
 *
 * The plugin registry assigns these routes on every page load, so whatever they
 * name is in the initial bundle. The pages carry the charting and data grid
 * stack, which no other page needs on first paint. Deferring them keeps the
 * route shape eager, so matching and the availability gates are unaffected.
 *
 * `path` is where the Monitor sidebar links to the page, so hovering that link
 * starts the fetch. Two pages share `/usage`, one for each license, and hovering
 * asks for both. That is a few kilobytes on one hover, in exchange for keeping
 * this a plain declaration rather than something the route factories have to
 * remember to do.
 */
function lazyPage(
  path: string,
  load: () => Promise<{ default: ComponentType }>,
) {
  registerPagePrefetch(path, load);

  const Page = lazy(load);

  return function SuspendedPage() {
    return (
      <Suspense
        fallback={<DelayedLoadingAndErrorWrapper loading error={null} />}
      >
        <Page />
      </Suspense>
    );
  };
}

const CliAnalyticsPage = lazyPage(Urls.monitorAiAuditingCli(), () =>
  import("./cli-analytics/components/CliAnalyticsPage").then(
    ({ CliAnalyticsPage }) => ({ default: CliAnalyticsPage }),
  ),
);

const McpAnalyticsPage = lazyPage(Urls.monitorAiAuditingMcp(), () =>
  import("./mcp-analytics/components/McpAnalyticsPage").then(
    ({ McpAnalyticsPage }) => ({ default: McpAnalyticsPage }),
  ),
);

// One conversation, linked to only from the list. The trailing slash keeps the
// list's own link from asking for this page as well.
const ConversationDetailPage = lazyPage(
  `${Urls.monitorAiAuditingConversations()}/`,
  () =>
    import("./metabot-analytics/components/ConversationDetailPage").then(
      ({ ConversationDetailPage }) => ({ default: ConversationDetailPage }),
    ),
);

const ConversationStatsPage = lazyPage(Urls.monitorAiAuditingUsage(), () =>
  import("./metabot-analytics/components/ConversationStatsPage").then(
    ({ ConversationStatsPage }) => ({ default: ConversationStatsPage }),
  ),
);

const ConversationsPage = lazyPage(Urls.monitorAiAuditingConversations(), () =>
  import("./metabot-analytics/components/ConversationsPage").then(
    ({ ConversationsPage }) => ({ default: ConversationsPage }),
  ),
);

const MetabotAnalyticsUpsellPage = lazyPage(Urls.monitorAiAuditingUsage(), () =>
  import("./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage").then(
    ({ MetabotAnalyticsUpsellPage }) => ({
      default: MetabotAnalyticsUpsellPage,
    }),
  ),
);

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
