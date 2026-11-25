import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSearchErrorEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockSetupState, createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { Route, useParams } from "metabase/router";
import type { TokenFeatures, UserSettings } from "metabase-types/api";
import {
  createMockBookmark,
  createMockCard,
  createMockCollection,
  createMockDataset,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { BrowseMetrics } from "../BrowseMetrics";
import { createMockMetricResult, createMockRecentMetric } from "../test-utils";
import type { MetricResult, RecentMetric } from "../types";

const TEST_DATASET = createMockDataset();

const defaultRootCollection = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const collectionAlpha = createMockCollection({ id: 99, name: "Alpha" });
const collectionBeta = createMockCollection({
  id: 1,
  name: "Beta",
  effective_ancestors: [collectionAlpha],
});
const collectionCharlie = createMockCollection({
  id: 2,
  name: "Charlie",
  effective_ancestors: [collectionAlpha, collectionBeta],
});
const collectionDelta = createMockCollection({
  id: 3,
  name: "Delta",
  effective_ancestors: [collectionAlpha, collectionBeta, collectionCharlie],
});
const collectionZulu = createMockCollection({
  id: 4,
  name: "Zulu",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
  ],
});
const collectionAngstrom = createMockCollection({
  id: 5,
  name: "Ångström",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
  ],
});
const collectionOzgur = createMockCollection({
  id: 6,
  name: "Özgür",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
  ],
});
const collectionGrande = createMockCollection({
  id: 7,
  name: "Grande",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
    collectionOzgur,
  ],
});

const mockMetrics: Partial<MetricResult>[] = [
  {
    id: 0,
    collection: collectionAlpha,
  },
  {
    id: 1,
    collection: collectionAlpha,
  },
  {
    id: 2,
    collection: collectionAlpha,
  },
  {
    id: 3,
    collection: collectionBeta,
  },
  {
    id: 4,
    collection: collectionBeta,
  },
  {
    id: 5,
    collection: collectionBeta,
  },
  {
    id: 6,
    collection: collectionCharlie,
  },
  {
    id: 7,
    collection: collectionCharlie,
  },
  {
    id: 8,
    collection: collectionCharlie,
  },
  {
    id: 9,
    collection: collectionDelta,
  },
  {
    id: 10,
    collection: collectionDelta,
  },
  {
    id: 11,
    collection: collectionDelta,
  },
  {
    id: 12,
    collection: collectionZulu,
  },
  {
    id: 13,
    collection: collectionZulu,
  },
  {
    id: 14,
    collection: collectionZulu,
  },
  {
    id: 15,
    collection: collectionAngstrom,
  },
  {
    id: 16,
    collection: collectionAngstrom,
  },
  {
    id: 17,
    collection: collectionAngstrom,
  },
  {
    id: 18,
    collection: collectionOzgur,
  },
  {
    id: 19,
    collection: collectionOzgur,
  },
  {
    id: 20,
    collection: collectionOzgur,
  },
  {
    id: 21,
    collection: defaultRootCollection, // Our analytics
  },
  {
    id: 22,
    collection: defaultRootCollection, // Our analytics
  },
  ...new Array(100).fill(null).map((_, i) => ({
    id: i + 300,
    collection: collectionGrande,
  })),
].map((partialMetric: Partial<MetricResult>) => ({
  name: `Metric ${partialMetric.id}`,
  collection: defaultRootCollection,
  last_editor_common_name: "Bobby",
  last_edited_at: "2000-01-01T00:00:00.000Z",
  ...partialMetric,
}));

export type SetupOpts = {
  metricCount?: number;
  recentMetricCount?: number;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  canCreateQueries?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  searchError?: boolean;
  /**
   * Metrics served by a stateful search endpoint: bookmark and archive
   * requests for a metric change it, and `verified=true` keeps only the
   * verified ones. Replaces the default fixture metrics.
   */
  metrics?: MetricResult[];
  verifiedMetricsFilter?: UserSettings["browse-filter-only-verified-metrics"];
};

export function setup({
  metricCount = Infinity,
  recentMetricCount = 5,
  showMetabaseLinks = true,
  tokenFeatures = {},
  canCreateQueries = true,
  enterprisePlugins = [],
  searchError = false,
  metrics: statefulMetrics,
  verifiedMetricsFilter,
}: SetupOpts = {}) {
  const state = createMockState({
    setup: createMockSetupState({
      locale: { name: "English", code: "en" },
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
      "browse-filter-only-verified-metrics": verifiedMetricsFilter,
    }),
    currentUser: createMockUser({
      id: 1,
      permissions: createMockUserPermissions({
        can_create_queries: canCreateQueries,
      }),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  const mockMetricResults = mockMetrics.map(createMockMetricResult);
  const mockRecentMetrics = mockMetrics.map((metric) =>
    // Unjustified type cast. FIXME
    createMockRecentMetric(metric as RecentMetric),
  );

  const metrics = statefulMetrics ?? mockMetricResults.slice(0, metricCount);
  const recentMetrics = mockRecentMetrics.slice(0, recentMetricCount);

  setupSettingsEndpoints([]);
  if (statefulMetrics) {
    setupStatefulMetricsEndpoints(statefulMetrics);
  } else if (searchError) {
    setupSearchErrorEndpoint();
  } else {
    setupSearchEndpoints(metrics.map(createMockSearchResult));
  }
  setupRecentViewsEndpoints(recentMetrics);

  // The stateful endpoints mock the card update themselves
  const metricsWithCardEndpoints = statefulMetrics ? [] : metrics;
  for (const metric of metricsWithCardEndpoints) {
    const card = createMockCard({
      id: metric.id,
    });

    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, TEST_DATASET);
  }

  return renderWithProviders(
    <>
      <Route path="/" element={<BrowseMetrics />} />
      <Route
        path="/metric/:cardId"
        element={<div data-testid="metric-detail-page" />}
      />
      <Route path="/collection/:slug" element={<CollectionPage />} />
    </>,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
}

function CollectionPage() {
  const { slug } = useParams();
  return <h1>{`Collection page ${slug}`}</h1>;
}

function isArchiveRequest(body: unknown): body is { archived: boolean } {
  return (
    typeof body === "object" &&
    body != null &&
    "archived" in body &&
    typeof body.archived === "boolean"
  );
}

/**
 * Stands in for the backend: each metric changes only when the request for
 * its own id arrives, so the page shows the change only after it refetches.
 */
function setupStatefulMetricsEndpoints(metrics: MetricResult[]) {
  fetchMock.get(
    "path:/api/search",
    (call) => {
      const params = new URL(call.url).searchParams;
      const isMetricSearch =
        params.getAll("models").length === 1 &&
        params.get("models") === "metric";
      const verifiedOnly = params.get("verified") === "true";
      const limit = Number(params.get("limit") ?? 50);
      const matching = isMetricSearch
        ? metrics.filter(
            (metric) =>
              !metric.archived &&
              (!verifiedOnly || metric.moderated_status === "verified"),
          )
        : [];
      return {
        data: matching.slice(0, limit),
        total: matching.length,
        models: params.getAll("models"),
        available_models: ["metric"],
        limit,
        offset: 0,
        table_db_id: null,
      };
    },
    { name: "search" },
  );

  metrics.forEach((metric) => {
    fetchMock.post(`path:/api/bookmark/card/${metric.id}`, () => {
      metric.bookmark = true;
      return createMockBookmark({
        id: `card-${metric.id}`,
        type: "card",
        item_id: metric.id,
        name: metric.name,
      });
    });
    fetchMock.delete(`path:/api/bookmark/card/${metric.id}`, () => {
      metric.bookmark = false;
      return { status: 204 };
    });
    fetchMock.put(`path:/api/card/${metric.id}`, (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      if (!isArchiveRequest(body)) {
        return { status: 400 };
      }
      metric.archived = body.archived;
      return createMockCard({ id: metric.id, archived: body.archived });
    });
  });
}
