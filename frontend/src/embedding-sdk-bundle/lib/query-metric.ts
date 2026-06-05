import { POST } from "metabase/api/legacy-client";
import type { Dataset, DatasetColumn, RowValues } from "metabase-types/api";
import type {
  JsMetricDefinition,
  MetricDatasetRequest,
} from "metabase-types/api/metric";

export type QueryMetricParams = {
  definition: JsMetricDefinition;
};

export type QueryMetricResult = {
  rowCount: number | null;
  runningTime: number | null;
  columns: DatasetColumn[];
  rows: RowValues[];
};

export const queryMetric =
  () =>
  async ({ definition }: QueryMetricParams): Promise<QueryMetricResult> => {
    const response: Dataset = await POST("/api/metric/dataset")({
      definition,
    } satisfies MetricDatasetRequest);

    return {
      rowCount: response.row_count ?? null,
      runningTime: response.running_time ?? null,
      columns: response.data?.cols ?? [],
      rows: response.data?.rows ?? [],
    };
  };
