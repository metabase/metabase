import type { Drill } from "metabase/visualizations/types/click-actions";
import type { DrillThruType } from "metabase-lib";
import { FKFilterDrill } from "metabase/visualizations/click-actions/drills/mlv2/FKFilterDrill";
import { SummarizeColumnByTimeDrill } from "metabase/visualizations/click-actions/drills/mlv2/SummarizeColumnByTimeDrill";
import { SortDrill } from "metabase/visualizations/click-actions/drills/mlv2/SortDrill";
import { ZoomBinsDrill } from "metabase/visualizations/click-actions/drills/mlv2/ZoomBinsDrill";
import { ZoomGeoDrill } from "metabase/visualizations/click-actions/drills/mlv2/ZoomGeoDrill";
import { ZoomTimeseriesDrill } from "metabase/visualizations/click-actions/drills/mlv2/ZoomTimeseriesDrill";
import { DistributionDrill } from "metabase/visualizations/click-actions/drills/mlv2/DistributionDrill";
import { SummarizeColumnDrill } from "metabase/visualizations/click-actions/drills/mlv2/SummarizeColumnDrill";
import { ObjectDetailsPkDrill } from "metabase/visualizations/click-actions/drills/mlv2/ObjectDetailsPkDrill";
import { ObjectDetailsFkDrill } from "metabase/visualizations/click-actions/drills/mlv2/ObjectDetailsFkDrill";
import { ObjectDetailsZoomDrill } from "metabase/visualizations/click-actions/drills/mlv2/ObjectDetailsZoomDrill";
import { UnderlyingRecordsDrill } from "metabase/visualizations/click-actions/drills/mlv2/UnderlyingRecordsDrill";
import { QuickFilterDrill } from "metabase/visualizations/click-actions/drills/mlv2/QuickFilterDrill";
import { PivotDrill } from "metabase/visualizations/click-actions/drills/mlv2/PivotDrill";

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
  Drill<any> | null
> = {
  "drill-thru/column-filter": null, // ColumnFilterDrill,
  "drill-thru/quick-filter": QuickFilterDrill,
  "drill-thru/pk": ObjectDetailsPkDrill,
  "drill-thru/zoom": ObjectDetailsZoomDrill,
  "drill-thru/fk-details": ObjectDetailsFkDrill,
  "drill-thru/pivot": PivotDrill,
  "drill-thru/fk-filter": FKFilterDrill,
  "drill-thru/distribution": DistributionDrill,
  "drill-thru/sort": SortDrill,
  "drill-thru/summarize-column": SummarizeColumnDrill,
  "drill-thru/summarize-column-by-time": SummarizeColumnByTimeDrill,
  "drill-thru/underlying-records": UnderlyingRecordsDrill,
  "drill-thru/zoom-in.bins": ZoomBinsDrill,
  "drill-thru/zoom-in.geo": ZoomGeoDrill,
  "drill-thru/zoom-in.timeseries": ZoomTimeseriesDrill,
};
