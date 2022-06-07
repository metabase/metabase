import { Dataset, DatasetData } from "metabase-types/api/dataset";

type MockDatasetOpts = Partial<Omit<Dataset, "data">> & {
  data?: Partial<DatasetData>;
};

export const createMockDataset = ({ data = {}, ...opts }: MockDatasetOpts) => ({
  data: {
    rows: [],
    cols: [{ display_name: "NAME", source: "native", name: "NAME" }],
    rows_truncated: 0,
    ...data,
  },
  database_id: 1,
  row_count: 0,
  running_time: 1000,
  ...opts,
});
