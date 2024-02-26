import type Question from "metabase-lib/Question";

import type { QueryClickActionsMode } from "../../types";
import { Mode, getModeType } from "../Mode";
import {
  MODE_TYPE_NATIVE,
  MODE_TYPE_SEGMENT,
  MODE_TYPE_METRIC,
  MODE_TYPE_TIMESERIES,
  MODE_TYPE_GEO,
  MODE_TYPE_PIVOT,
} from "../Mode/constants";
import { DefaultMode } from "../modes/DefaultMode";
import { GeoMode } from "../modes/GeoMode";
import { MetricMode } from "../modes/MetricMode";
import { NativeMode } from "../modes/NativeMode";
import { PivotMode } from "../modes/PivotMode";
import { SegmentMode } from "../modes/SegmentMode";
import { TimeseriesMode } from "../modes/TimeseriesMode";

export function getMode(question: Question): Mode | null {
  const queryMode = getQueryMode(question);
  return queryMode ? new Mode(question, queryMode) : null;
}

// TODO [#26836]: remove "any" - unify ClickAction type
export function getQueryMode(
  question: Question,
): QueryClickActionsMode | any | null {
  const mode = getModeType(question);
  if (!mode) {
    return null;
  }

  switch (mode) {
    case MODE_TYPE_NATIVE:
      return NativeMode;

    case MODE_TYPE_SEGMENT:
      return SegmentMode;

    case MODE_TYPE_METRIC:
      return MetricMode;

    case MODE_TYPE_TIMESERIES:
      return TimeseriesMode;

    case MODE_TYPE_GEO:
      return GeoMode;

    case MODE_TYPE_PIVOT:
      return PivotMode;

    default:
      return DefaultMode;
  }
}
