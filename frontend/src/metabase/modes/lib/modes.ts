import Question from "metabase-lib/Question";
import Mode, { getModeType } from "metabase-lib/Mode";
import {
  MODE_TYPE_ACTION,
  MODE_TYPE_NATIVE,
  MODE_TYPE_SEGMENT,
  MODE_TYPE_METRIC,
  MODE_TYPE_TIMESERIES,
  MODE_TYPE_GEO,
  MODE_TYPE_PIVOT,
} from "metabase-lib/Mode/constants";
import type { QueryMode } from "metabase-lib/queries/drills/types";
import ActionMode from "../components/modes/ActionMode";
import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";

export function getMode(question: Question): Mode | null {
  const queryMode = getQueryMode(question);
  return queryMode ? new Mode(question, queryMode) : null;
}

// TODO [#26836]: remove "any"
export function getQueryMode(question: Question): QueryMode | any | null {
  const mode = getModeType(question);
  if (!mode) {
    return null;
  }

  switch (mode) {
    case MODE_TYPE_ACTION:
      return ActionMode;

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
