import type { Drill } from "metabase/visualizations/types/click-actions";
import type { DrillThruType } from "metabase-lib";
import { FKFilterDrill } from "metabase/visualizations/click-actions/drills/mlv2/FKFilterDrill";
import { SummarizeColumnByTimeDrill } from "metabase/visualizations/click-actions/drills/mlv2/SummarizeColumnByTimeDrill";
import { ColumnFilterDrill } from "metabase/visualizations/click-actions/drills/mlv2/ColumnFilterDrill";
import { QuickFilterDrill } from "metabase/visualizations/click-actions/drills/mlv2/QuickFilterDrill";
import { PKDetailsDrill } from "metabase/visualizations/click-actions/drills/mlv2/PKDetailsDrill";
import { ZoomToRowDrill } from "metabase/visualizations/click-actions/drills/mlv2/ZoomDrill";
import { FKDetailsDrill } from "metabase/visualizations/click-actions/drills/mlv2/FKDetailsDrill";
import { DistributionDrill } from "metabase/visualizations/click-actions/drills/mlv2/DistributionDrill";
import { SortDrill } from "metabase/visualizations/click-actions/drills/mlv2/SortDrill";
import { SummarizeColumnDrill } from "metabase/visualizations/click-actions/drills/mlv2/SummarizeColumnDrill";
import { UnderlyingRecordsDrill } from "metabase/visualizations/click-actions/drills/mlv2/UnderlyingRecordsDrill";

export const MODE_TYPE_DEFAULT = "default";
export const MODE_TYPE_NATIVE = "native";
export const MODE_TYPE_SEGMENT = "segment";
export const MODE_TYPE_METRIC = "metric";
export const MODE_TYPE_TIMESERIES = "timeseries";
export const MODE_TYPE_GEO = "geo";
export const MODE_TYPE_PIVOT = "pivot";

export const MODES_TYPES = [
  MODE_TYPE_NATIVE,
  MODE_TYPE_SEGMENT,
  MODE_TYPE_METRIC,
  MODE_TYPE_TIMESERIES,
  MODE_TYPE_GEO,
  MODE_TYPE_PIVOT,
  MODE_TYPE_DEFAULT,
] as const;

export const DRILL_TYPE_TO_HANDLER_MAP: Record<
  DrillThruType,
  DrillMLv2<any> | null
> = {
  "drill-thru/column-filter": ColumnFilterDrill,
  "drill-thru/quick-filter": QuickFilterDrill,
  "drill-thru/pk": PKDetailsDrill,
  "drill-thru/zoom": ZoomToRowDrill,
  "drill-thru/fk-details": FKDetailsDrill,
  "drill-thru/pivot": null,
  "drill-thru/fk-filter": FKFilterDrill,
  "drill-thru/distribution": DistributionDrill,
  "drill-thru/sort": SortDrill,
  "drill-thru/summarize-column": SummarizeColumnDrill,
  "drill-thru/summarize-column-by-time": SummarizeColumnByTimeDrill,
  "drill-thru/underlying-records": UnderlyingRecordsDrill,
};
