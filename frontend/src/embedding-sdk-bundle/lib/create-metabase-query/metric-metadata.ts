import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { TableQueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { isMetricReference } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";

export const loadReferencedMetricMetadata = (
  store: SdkStore,
  input: TableQueryInput,
) =>
  Promise.all(
    collectMetricIdsToLoadMetadata(input).map((metricId) =>
      loadMetricMetadata(store, metricId),
    ),
  );

const collectMetricIdsToLoadMetadata = (query: TableQueryInput): number[] => [
  ...new Set(
    query.aggregations?.filter(isMetricReference).map((metric) => metric.id),
  ),
];

const loadMetricMetadata = (store: SdkStore, metricId: number) =>
  Promise.all([
    runRtkEndpoint(
      { id: metricId },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    ),
    runRtkEndpoint(
      metricId,
      store.dispatch,
      cardApi.endpoints.getCardQueryMetadata,
      { forceRefetch: false },
    ),
  ]);
