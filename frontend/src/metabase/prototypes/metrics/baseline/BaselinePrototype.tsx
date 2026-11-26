/* eslint-disable boundaries/element-types, eslint-js/no-restricted-imports -- throwaway prototype: the baseline renders the real metric pages under nested routes. */
import { Route, Routes } from "react-router";

import { useListCardsQuery } from "metabase/api";
import type { MetricUrls } from "metabase/common/metrics/types";
import { MetricAboutPage } from "metabase/metrics/pages/MetricAboutPage";
import { MetricDependenciesPage } from "metabase/metrics/pages/MetricDependenciesPage";
import { MetricDimensionsPage } from "metabase/metrics/pages/MetricDimensionsPage";
import { MetricHistoryPage } from "metabase/metrics/pages/MetricHistoryPage";
import { MetricOverviewPage } from "metabase/metrics/pages/MetricOverviewPage";
import { MetricQueryPage } from "metabase/metrics/pages/MetricQueryPage";
import { NewMetricPage } from "metabase/metrics/pages/NewMetricPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Link, Navigate, useLocation, useNavigate } from "metabase/router";
import { Box, Button, Group, Loader, Select, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CardId } from "metabase-types/api";

const BASE = "/prototypes/baseline/metrics";

/**
 * The real Data Studio metric pages, routed under the prototype so their tabs
 * stay inside the canvas.
 */
const urls: MetricUrls = {
  about: (id: CardId) => `${BASE}/${id}`,
  overview: (id: CardId) => `${BASE}/${id}/overview`,
  query: (id: CardId) => `${BASE}/${id}/query`,
  dimensions: (id: CardId) => `${BASE}/${id}/dimensions`,
  history: (id: CardId) => `${BASE}/${id}/history`,
  dependencies: (id: CardId) => `${BASE}/${id}/dependencies`,
  database: (databaseId) => Urls.dataStudioData({ databaseId }),
  table: (_databaseId, tableId) => Urls.dataStudioTable(tableId),
};

const pageProps = { urls, showAppSwitcher: false, showDataStudioLink: false };

export function BaselinePrototype() {
  return (
    <Box>
      <MetricPicker />
      <Box
        h="calc(100vh - 180px)"
        mih={600}
        style={{
          border: "1px solid var(--mb-color-border-neutral)",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Routes>
          <Route path="metrics/new" element={<NewMetricPage urls={urls} />} />
          <Route
            path="metrics/:cardId"
            element={<MetricAboutPage {...pageProps} />}
          />
          <Route
            path="metrics/:cardId/overview"
            element={<MetricOverviewPage {...pageProps} />}
          />
          <Route
            path="metrics/:cardId/query"
            element={<MetricQueryPage {...pageProps} />}
          />
          <Route
            path="metrics/:cardId/dimensions"
            element={<MetricDimensionsPage {...pageProps} />}
          />
          {PLUGIN_DEPENDENCIES.isEnabled && (
            <Route
              path="metrics/:cardId/dependencies"
              element={<MetricDependenciesPage {...pageProps} />}
            >
              <Route
                index
                element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />}
              />
            </Route>
          )}
          <Route
            path="metrics/:cardId/history"
            element={<MetricHistoryPage {...pageProps} />}
          />
          <Route path="*" element={<EmptyState />} />
        </Routes>
      </Box>
    </Box>
  );
}

function useMetrics() {
  const { data: cards = [], isLoading } = useListCardsQuery({ f: "all" });
  return {
    metrics: cards.filter((card) => card.type === "metric" && !card.archived),
    isLoading,
  };
}

function MetricPicker() {
  const { metrics } = useMetrics();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentId = pathname.match(/\/metrics\/(\d+)/)?.[1] ?? null;

  return (
    <Group mb="md" gap="sm">
      <Select
        w={320}
        placeholder="Pick a metric"
        searchable
        value={currentId}
        data={metrics.map((m) => ({ value: String(m.id), label: m.name }))}
        onChange={(value) => value && navigate(`${BASE}/${value}/overview`)}
      />
      <Button component={Link} to={`${BASE}/new`} variant="default">
        New metric
      </Button>
    </Group>
  );
}

function EmptyState() {
  const { metrics, isLoading } = useMetrics();
  if (isLoading) {
    return <Loader m="xl" />;
  }
  if (metrics.length > 0) {
    return <Navigate to={`${BASE}/${metrics[0].id}/overview`} replace />;
  }
  return (
    <Box p="xl">
      <Text c="text-secondary">
        No metrics in this instance yet. Create one with “New metric”.
      </Text>
    </Box>
  );
}
