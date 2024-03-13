import type { Drill } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";

import { automaticInsightsDrill } from "./automatic-insights-drill";
import { columnExtractDrill } from "./column-extract-drill";
import { columnFilterDrill } from "./column-filter-drill";
import { combineColumnsDrill } from "./combine-columns-drill";
import { distributionDrill } from "./distribution-drill";
import { fkDetailsDrill } from "./fk-details-drill";
import { fkFilterDrill } from "./fk-filter-drill";
import { pivotDrill } from "./pivot-drill";
import { pkDrill } from "./pk-drill";
import { quickFilterDrill } from "./quick-filter-drill";
import { sortDrill } from "./sort-drill";
import { summarizeColumnByTimeDrill } from "./summarize-column-by-time-drill";
import { summarizeColumnDrill } from "./summarize-column-drill";
import { underlyingRecordsDrill } from "./underlying-records-drill";
import { zoomDrill } from "./zoom-drill";
import { zoomInBinningDrill } from "./zoom-in-binning-drill";
import { zoomInGeographicDrill } from "./zoom-in-geographic-drill";
import { zoomInTimeseriesDrill } from "./zoom-in-timeseries-drill";

export const DRILLS: Record<Lib.DrillThruType, Drill<any>> = {
  "drill-thru/automatic-insights": automaticInsightsDrill,
  "drill-thru/column-extract": columnExtractDrill,
  "drill-thru/column-filter": columnFilterDrill,
  "drill-thru/combine-columns": combineColumnsDrill,
  "drill-thru/distribution": distributionDrill,
  "drill-thru/fk-details": fkDetailsDrill,
  "drill-thru/fk-filter": fkFilterDrill,
  "drill-thru/pivot": pivotDrill,
  "drill-thru/pk": pkDrill,
  "drill-thru/quick-filter": quickFilterDrill,
  "drill-thru/sort": sortDrill,
  "drill-thru/summarize-column-by-time": summarizeColumnByTimeDrill,
  "drill-thru/summarize-column": summarizeColumnDrill,
  "drill-thru/underlying-records": underlyingRecordsDrill,
  "drill-thru/zoom": zoomDrill,
  "drill-thru/zoom-in.binning": zoomInBinningDrill,
  "drill-thru/zoom-in.geographic": zoomInGeographicDrill,
  "drill-thru/zoom-in.timeseries": zoomInTimeseriesDrill,
};
