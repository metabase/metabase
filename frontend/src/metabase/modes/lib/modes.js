import ObjectMode from "../components/modes/ObjectMode";
import SegmentMode from "../components/modes/SegmentMode";
import MetricMode from "../components/modes/MetricMode";
import TimeseriesMode from "../components/modes/TimeseriesMode";
import GeoMode from "../components/modes/GeoMode";
import PivotMode from "../components/modes/PivotMode";
import NativeMode from "../components/modes/NativeMode";
import DefaultMode from "../components/modes/DefaultMode";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

const isPKFilter = (filters, query) => {
  const sourceTablePKFields =
    query?.table()?.fields.filter(field => field.isPK()) || [];

  if (sourceTablePKFields.length === 0) {
    return false;
  }

  const hasEqualityFilterForEveryPK = sourceTablePKFields.every(pkField => {
    const filter = filters.find(filter => filter.field()?.id === pkField.id);

    return filter?.operatorName() === "=" && filter?.arguments().length === 1;
  });

  return hasEqualityFilterForEveryPK;
};

export function getMode(question) {
  if (!question) {
    return null;
  }

  const query = question.query();

  if (query instanceof NativeQuery) {
    return NativeMode;
  }

  if (query instanceof StructuredQuery) {
    const aggregations = query.aggregations();
    const breakouts = query.breakouts();
    const filters = query.filters();

    if (aggregations.length === 0 && breakouts.length === 0) {
      if (isPKFilter(filters, query)) {
        return ObjectMode;
      } else {
        return SegmentMode;
      }
    }
    if (aggregations.length > 0 && breakouts.length === 0) {
      return MetricMode;
    }
    if (aggregations.length > 0 && breakouts.length > 0) {
      const breakoutFields = breakouts.map(b => b.field());
      if (
        (breakoutFields.length === 1 && breakoutFields[0].isDate()) ||
        (breakoutFields.length === 2 &&
          breakoutFields[0].isDate() &&
          breakoutFields[1].isCategory())
      ) {
        return TimeseriesMode;
      }
      if (breakoutFields.length === 1 && breakoutFields[0].isAddress()) {
        return GeoMode;
      }
      if (
        (breakoutFields.length === 1 && breakoutFields[0].isCategory()) ||
        (breakoutFields.length === 2 &&
          breakoutFields[0].isCategory() &&
          breakoutFields[1].isCategory())
      ) {
        return PivotMode;
      }
    }
  }

  return DefaultMode;
}
