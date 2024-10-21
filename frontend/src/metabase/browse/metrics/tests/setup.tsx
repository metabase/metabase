import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Database, TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockDataset,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

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
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  databases?: Database[];
};

const MOCK_DATABASE = createMockDatabase({ id: 1, name: "Database Name" });

export function setup({
  metricCount = Infinity,
  recentMetricCount = 5,
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
  databases = [MOCK_DATABASE],
}: SetupOpts = {}) {
  const state = createMockState({
    setup: createMockSetupState({
      locale: { name: "English", code: "en" },
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ id: 1 }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const mockMetricResults = mockMetrics.map(createMockMetricResult);
  const mockRecentMetrics = mockMetrics.map(metric =>
    createMockRecentMetric(metric as RecentMetric),
  );

  const metrics = mockMetricResults.slice(0, metricCount);
  const recentMetrics = mockRecentMetrics.slice(0, recentMetricCount);

  setupDatabasesEndpoints(databases);
  setupSettingsEndpoints([]);
  setupSearchEndpoints(metrics.map(createMockSearchResult));
  setupRecentViewsEndpoints(recentMetrics);

  for (const metric of metrics) {
    const card = createMockCard({
      id: metric.id,
    });

    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, TEST_DATASET);
  }

  return renderWithProviders(<BrowseMetrics />, { storeInitialState: state });
}
