import { GET, POST } from "metabase/api/legacy-client";
import type {
  Dataset,
  DatasetColumn,
  RowValues,
  StructuredDatasetQuery,
} from "metabase-types/api";

export type QueryDatasetParams = {
  datasetQuery:
    | StructuredDatasetQuery
    | Omit<StructuredDatasetQuery, "database">;
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
    const query =
      "database" in datasetQuery && datasetQuery.database != null
        ? datasetQuery
        : await withTableDatabaseId(datasetQuery);

    const response: Dataset = await POST("/api/dataset")(query);

    return {
      rowCount: response.row_count ?? null,
      runningTime: response.running_time ?? null,
      columns: response.data?.cols ?? [],
      rows: response.data?.rows ?? [],
    };
  };

async function withTableDatabaseId(
  datasetQuery: Omit<StructuredDatasetQuery, "database">,
): Promise<StructuredDatasetQuery> {
  const tableId = datasetQuery.query?.["source-table"];

  if (typeof tableId !== "number") {
    throw new Error("A database id is required for this dataset query.");
  }

  const table = await GET(`/api/table/${tableId}`)();

  return {
    ...datasetQuery,
    database: table.db_id,
  };
}
