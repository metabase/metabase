import type {
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
  WATERFALL_END_KEY,
  WATERFALL_START_KEY,
  WATERFALL_START_2_KEY,
  WATERFALL_END_2_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";
import type { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { RowValue } from "metabase-types/api";

export type WaterfallDataKey =
  | typeof WATERFALL_START_KEY
  | typeof WATERFALL_END_KEY
  | typeof WATERFALL_START_2_KEY // needed for candlestick
  | typeof WATERFALL_END_2_KEY // needed for candlestick
  | typeof WATERFALL_VALUE_KEY
  | typeof WATERFALL_TOTAL_KEY;

export type WaterfallDatum = {
  [key in WaterfallDataKey]?: number | null;
} & { [key in typeof X_AXIS_DATA_KEY]: RowValue };

export type WaterfallDataset = WaterfallDatum[];
