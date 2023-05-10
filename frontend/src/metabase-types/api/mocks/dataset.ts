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

export type MockDatasetOpts = Partial<Omit<Dataset, "data">> & {
  data?: Partial<DatasetData>;
};

export const createMockDatasetData = ({
  cols = [createMockColumn()],
  ...opts
}: Partial<DatasetData>) => {
  return {
    rows: [],
    cols,
    rows_truncated: 0,
    results_metadata: createMockResultsMetadata(cols),
    ...opts,
  };
};

export const createMockDataset = ({
  data = {},
  ...opts
}: MockDatasetOpts = {}) => {
  const columns: DatasetColumn[] = data.cols ?? [createMockColumn()];

  return {
    data: createMockDatasetData({
      ...data,
      cols: columns,
    }),
    database_id: 1,
    row_count: 0,
    running_time: 1000,
    ...opts,
  };
};

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
