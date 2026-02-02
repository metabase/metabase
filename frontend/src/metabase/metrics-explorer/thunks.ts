import { cardApi, datasetApi, measureApi, tableApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import * as Lib from "metabase-lib";
import type {
  Card,
  CardId,
  Dataset,
  Measure,
  MeasureId,
  Table,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import type {
  MeasureData,
  MetricData,
  MetricSourceId,
} from "metabase-types/store/metrics-explorer";

import { selectModifiedQueryForSource, selectSourceOrder } from "./selectors";

// Module-level abort controller for cancelling in-flight fetchAllResults requests
let currentFetchAllController: AbortController | null = null;

/**
 * Fetch card and metadata for a metric source (no dataset - that comes from fetchSourceResult).
 */
export const fetchMetricSource = createAsyncThunk<
  MetricData | null,
  { cardId: CardId }
>("metricsExplorer/fetchMetricSource", async ({ cardId }, { dispatch }) => {
  const cardPromise = dispatch(
    cardApi.endpoints.getCard.initiate({ id: cardId }),
  );
  const metadataPromise = dispatch(
    cardApi.endpoints.getCardQueryMetadata.initiate(cardId),
  );

  const [cardResult] = await Promise.all([cardPromise, metadataPromise]);

  if (cardResult.data) {
    return {
      card: cardResult.data as Card,
      // Placeholder dataset - actual data comes from fetchSourceResult
      dataset: { data: { cols: [], rows: [] } } as unknown as Dataset,
    };
  }

  return null;
});

/**
 * Fetch measure and table metadata for a measure source.
 */
export const fetchMeasureSource = createAsyncThunk<
  MeasureData | null,
  { measureId: MeasureId }
>("metricsExplorer/fetchMeasureSource", async ({ measureId }, { dispatch }) => {
  const measureResult = await dispatch(
    measureApi.endpoints.getMeasure.initiate(measureId),
  );

  if (!measureResult.data) {
    return null;
  }

  const measure = measureResult.data as Measure;

  const tableResult = await dispatch(
    tableApi.endpoints.getTableQueryMetadata.initiate({
      id: measure.table_id,
    }),
  );

  if (!tableResult.data) {
    return null;
  }

  return {
    measure,
    table: tableResult.data as Table,
  };
});

/**
 * Fetch query result for a source using its modified query (with projection config applied).
 */
export const fetchSourceResult = createAsyncThunk<
  Dataset | null,
  { sourceId: MetricSourceId; signal: AbortSignal },
  { rejectValue: { sourceId: MetricSourceId; error: string } }
>(
  "metricsExplorer/fetchSourceResult",
  async ({ sourceId, signal }, { dispatch, getState, rejectWithValue }) => {
    // Check if already aborted
    if (signal.aborted) {
      return rejectWithValue({ sourceId, error: "Request aborted" });
    }

    const state = getState();
    const query = selectModifiedQueryForSource(state, sourceId);

    if (!query) {
      return rejectWithValue({ sourceId, error: "Failed to build query" });
    }

    const datasetQuery = Lib.toLegacyQuery(query);
    const result = await dispatch(
      datasetApi.endpoints.getAdhocQuery.initiate(datasetQuery),
    );

    // Check if aborted after fetch
    if (signal.aborted) {
      return rejectWithValue({ sourceId, error: "Request aborted" });
    }

    return (result.data as Dataset) ?? null;
  },
);

/**
 * Fetch results for all sources.
 * Uses AbortController to cancel in-flight requests when called again.
 */
export const fetchAllResults =
  () =>
  async (dispatch: Dispatch, getState: GetState): Promise<void> => {
    // Abort any previous in-flight fetch
    currentFetchAllController?.abort();
    currentFetchAllController = new AbortController();
    const signal = currentFetchAllController.signal;

    const sourceOrder = selectSourceOrder(getState());

    const fetchPromises = sourceOrder.map(sourceId =>
      dispatch(fetchSourceResult({ sourceId, signal })),
    );

    // Use allSettled to ensure we don't throw on aborted requests
    await Promise.allSettled(fetchPromises);
  };
