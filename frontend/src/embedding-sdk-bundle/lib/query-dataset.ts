import { POST } from "metabase/api/legacy-client";
import type {
  Dataset,
  DatasetColumn,
  DatasetQuery,
  RowValues,
} from "metabase-types/api";

export type QueryDatasetParams = {
  datasetQuery: DatasetQuery;
};

export type QueryDatasetResult = {
  rowCount: number | null;
  runningTime: number | null;
  columns: DatasetColumn[];
  rows: RowValues[];
};

export const queryDataset =
  () =>
  async ({ datasetQuery }: QueryDatasetParams): Promise<QueryDatasetResult> => {
    const response: Dataset = await POST("/api/dataset")(datasetQuery);

    return {
      rowCount: response.row_count ?? null,
      runningTime: response.running_time ?? null,
      columns: response.data?.cols ?? [],
      rows: response.data?.rows ?? [],
    };
  };
