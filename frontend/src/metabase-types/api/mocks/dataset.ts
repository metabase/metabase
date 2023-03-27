import {
  Dataset,
  DatasetColumn,
  DatasetData,
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
}: MockDatasetOpts = {}) => ({
  data: {
    rows: [],
    cols: [
      createMockColumn({
        display_name: "NAME",
        source: "native",
        name: "NAME",
      }),
    ],
    rows_truncated: 0,
    ...data,
  },
  database_id: 1,
  row_count: 0,
  running_time: 1000,
  ...opts,
});
