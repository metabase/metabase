import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";
import { QueryMode } from "metabase-types/types/Visualization";

import Question from "metabase-lib/lib/Question";
import { getMode as getModeFromLib } from "metabase-lib/lib/Mode";
import {
  MODE_TYPE_NATIVE,
  MODE_TYPE_SEGMENT,
  MODE_TYPE_METRIC,
  MODE_TYPE_TIMESERIES,
  MODE_TYPE_GEO,
  MODE_TYPE_PIVOT,
} from "metabase-lib/lib/Mode/constants";

export function getMode(question: Question): QueryMode | any | null {
  const mode = getModeFromLib(question);
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
