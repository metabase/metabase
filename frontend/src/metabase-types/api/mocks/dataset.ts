import {
  Dataset,
  DatasetColumn,
  DatasetData,
  ResultsMetadata,
  TemplateTag,
} from "metabase-types/api/dataset";

export const createMockColumn = (data: Partial<DatasetColumn>) => {
  return {
    display_name: "Column",
    source: "native",
    name: "column",
    ...data,
  };
};

export type MockDatasetOpts = Partial<Omit<Dataset, "data">> & {
  data?: Partial<DatasetData>;
};

export const createMockDataset = ({
  data = {},
  ...opts
}: MockDatasetOpts = {}) => {
  const columns = data.cols ?? [
    createMockColumn({
      display_name: "NAME",
      source: "native",
      name: "NAME",
    }),
  ];

  return {
    data: {
      rows: [],
      cols: columns,
      rows_truncated: 0,
      ...data,
    },
    database_id: 1,
    row_count: 0,
    running_time: 1000,
    results_metadata: createMockResultsMetadata(columns),
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
  columns: DatasetColumn[] = [createMockColumn({})],
  opts?: Partial<ResultsMetadata>,
): ResultsMetadata => ({
  columns,
  ...opts,
});
