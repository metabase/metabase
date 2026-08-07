import { type ComponentType, Suspense, lazy } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Route, redirect } from "metabase/router";

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
 */
function lazyPage(load: () => Promise<{ default: ComponentType }>) {
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

const CliAnalyticsPage = lazyPage(() =>
  import("./cli-analytics/components/CliAnalyticsPage").then(
    ({ CliAnalyticsPage }) => ({ default: CliAnalyticsPage }),
  ),
);

const McpAnalyticsPage = lazyPage(() =>
  import("./mcp-analytics/components/McpAnalyticsPage").then(
    ({ McpAnalyticsPage }) => ({ default: McpAnalyticsPage }),
  ),
);

const ConversationDetailPage = lazyPage(() =>
  import("./metabot-analytics/components/ConversationDetailPage").then(
    ({ ConversationDetailPage }) => ({ default: ConversationDetailPage }),
  ),
);

const ConversationStatsPage = lazyPage(() =>
  import("./metabot-analytics/components/ConversationStatsPage").then(
    ({ ConversationStatsPage }) => ({ default: ConversationStatsPage }),
  ),
);

const ConversationsPage = lazyPage(() =>
  import("./metabot-analytics/components/ConversationsPage").then(
    ({ ConversationsPage }) => ({ default: ConversationsPage }),
  ),
);

const MetabotAnalyticsUpsellPage = lazyPage(() =>
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
