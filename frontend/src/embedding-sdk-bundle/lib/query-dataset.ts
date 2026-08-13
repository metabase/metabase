import { api } from "metabase/api/client";
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
    // `api.request` resolves to `unknown` (it does not take a response type
    // parameter), so the /api/dataset body has to be named here.
    const response = (await api.request({
      method: "POST",
      url: "/api/dataset",
      body: datasetQuery,
    })) as Dataset;

    return {
      rowCount: response.row_count ?? null,
      runningTime: response.running_time ?? null,
      columns: response.data?.cols ?? [],
      rows: response.data?.rows ?? [],
    };
  };
