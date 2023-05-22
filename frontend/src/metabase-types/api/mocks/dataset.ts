import {
  Dataset,
  DatasetColumn,
  DatasetData,
  ResultsMetadata,
  TemplateTag,
} from "metabase-types/api/dataset";

export const createMockColumn = (
  data: Partial<DatasetColumn> = {},
): DatasetColumn => {
  return {
    id: 1,
    display_name: "Column",
    source: "native",
    name: "column",
    description: null,
    coercion_strategy: null,
    visibility_type: "normal",
    table_id: 1,
    fingerprint: null,
    ...data,
  };
};

export const createMockDatasetData = ({
  cols = [
    createMockColumn({
      display_name: "NAME",
      source: "native",
      name: "NAME",
    }),
  ],
  ...opts
}: Partial<DatasetData>): DatasetData => ({
  rows: [],
  cols,
  rows_truncated: 0,
  results_metadata: createMockResultsMetadata(cols),
  ...opts,
});

export type MockDatasetOpts = Partial<Omit<Dataset, "data">> & {
  data?: Partial<DatasetData>;
};

export const createMockDataset = ({
  data = {},
  ...opts
}: MockDatasetOpts = {}) => ({
  data: createMockDatasetData(data),
  database_id: 1,
  row_count: 0,
  running_time: 1000,
  ...opts,
});

export const createMockTemplateTag = (
  opts?: Partial<TemplateTag>,
): TemplateTag => ({
  id: "abc",
  name: "tag",
  "display-name": "Tag",
  type: "text",
  ...opts,
});

export const createMockResultsMetadata = (
  columns: DatasetColumn[] = [createMockColumn()],
  opts?: Partial<ResultsMetadata>,
): ResultsMetadata => ({
  columns,
  ...opts,
});
