import type {
  BreakoutSeriesModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { createMockColumn } from "metabase-types/api/mocks";

export const createMockSeriesModel = (
  opts?: Partial<SeriesModel>,
): SeriesModel => {
  const dataKey = opts?.dataKey ?? "dataKey";
  return {
    dataKey,
    name: `name for ${dataKey}`,
    tooltipName: `tooltip name for ${dataKey}`,
    color: "red",
    legacySeriesSettingsObjectKey: { card: { _seriesKey: dataKey } },
    vizSettingsKey: dataKey,
    column: createMockColumn({ name: dataKey }),
    columnIndex: 1,
    ...opts,
  };
};

export const createMockBreakoutSeriesModel = (
  opts?: Partial<BreakoutSeriesModel>,
): BreakoutSeriesModel => ({
  breakoutColumn: createMockColumn({ name: "breakoutColumn" }),
  breakoutColumnIndex: 2,
  breakoutValue: "foo",
  ...createMockSeriesModel(opts),
});
