import { GAUGE_CHART_TYPE } from "metabase/static-viz/components/Gauge/constants";
import { GAUGE_CHART_DEFAULT_OPTIONS } from "metabase/static-viz/components/Gauge/constants.dev";
import {
  ROW_CHART_TYPE,
  ROW_CHART_DEFAULT_OPTIONS,
} from "metabase/static-viz/components/RowChart/constants";
import {
  CATEGORICAL_DONUT_CHART_DEFAULT_OPTIONS,
  CATEGORICAL_DONUT_CHART_TYPE,
} from "../../components/CategoricalDonutChart/constants";
import {
  TIME_SERIES_WATERFALL_CHART_DEFAULT_OPTIONS,
  CATEGORICAL_WATERFALL_CHART_DEFAULT_OPTIONS,
  WATERFALL_CHART_TYPE,
} from "../../components/WaterfallChart/constants";
import {
  PROGRESS_BAR_DEFAULT_DATA_1,
  PROGRESS_BAR_TYPE,
} from "../../components/ProgressBar/constants";
import {
  LINE_AREA_BAR_CHART_TYPE,
  LINE_AREA_BAR_DEFAULT_OPTIONS_1,
} from "../../components/LineAreaBarChart/constants";
import {
  FUNNEL_CHART_DEFAULT_OPTIONS,
  FUNNEL_CHART_TYPE,
} from "../../components/FunnelChart/constants";

export const STATIC_CHART_TYPES = [
  CATEGORICAL_DONUT_CHART_TYPE,
  WATERFALL_CHART_TYPE,
  WATERFALL_CHART_TYPE,
  GAUGE_CHART_TYPE,
  PROGRESS_BAR_TYPE,
  LINE_AREA_BAR_CHART_TYPE,
  FUNNEL_CHART_TYPE,
  ROW_CHART_TYPE,
] as const;

export const STATIC_CHART_DEFAULT_OPTIONS = [
  CATEGORICAL_DONUT_CHART_DEFAULT_OPTIONS,
  CATEGORICAL_WATERFALL_CHART_DEFAULT_OPTIONS,
  TIME_SERIES_WATERFALL_CHART_DEFAULT_OPTIONS,
  GAUGE_CHART_DEFAULT_OPTIONS,
  PROGRESS_BAR_DEFAULT_DATA_1,
  LINE_AREA_BAR_DEFAULT_OPTIONS_1,
  FUNNEL_CHART_DEFAULT_OPTIONS,
  ROW_CHART_DEFAULT_OPTIONS,
] as const;
