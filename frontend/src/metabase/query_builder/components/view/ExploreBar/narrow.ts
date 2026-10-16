import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { STAGE_INDEX, getBreakoutNames } from "./utils";

// a clicked period zooms in to a unit that still shows a useful number of points
const FINER_UNITS: Record<string, string> = {
  year: "month",
  quarter: "week",
  month: "day",
  week: "day",
  day: "hour",
  hour: "minute",
};

function findUnderlyingRecordsDrill(
  question: Question,
  clicked: Lib.ClickObject,
): Lib.DrillThru | null {
  const query = question.query();
  const drills = Lib.availableDrillThrus(
    query,
    STAGE_INDEX,
    question.id(),
    clicked.column,
    clicked.value,
    clicked.data,
    clicked.dimensions,
  );
  return (
    drills.find(
      (drill) =>
        Lib.displayInfo(query, STAGE_INDEX, drill).type ===
        "drill-thru/underlying-records",
    ) ?? null
  );
}

/** The next finer unit a date grouping can use, like month → week. */
function getFinerBucket(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  bucket: Lib.Bucket | null,
): Lib.Bucket | null {
  if (bucket == null) {
    return null;
  }
  const currentUnit = Lib.displayInfo(query, STAGE_INDEX, bucket).shortName;
  const finerUnit = FINER_UNITS[currentUnit];
  if (finerUnit == null) {
    return null;
  }
  return (
    Lib.availableTemporalBuckets(query, STAGE_INDEX, column).find(
      (candidate) =>
        Lib.displayInfo(query, STAGE_INDEX, candidate).shortName === finerUnit,
    ) ?? null
  );
}

/**
 * Clicking a bar, point, or pivot cell narrows the slice to it: its values become filters, and
 * the cut moves on. A clicked date zooms in to a finer unit; any other clicked grouping is
 * dropped, since the slice now holds a single value of it. `null` when the click isn't on a
 * summarized value.
 */
export function getNarrowedQuery(
  question: Question,
  clicked: Lib.ClickObject,
): Lib.Query | null {
  const dimensions = clicked.dimensions ?? [];
  const isSingleValueClick =
    dimensions.length > 0 &&
    dimensions.every(
      (dimension) => dimension.value != null && !Array.isArray(dimension.value),
    );
  if (!isSingleValueClick) {
    return null;
  }
  const drill = findUnderlyingRecordsDrill(question, clicked);
  if (drill == null) {
    return null;
  }

  const query = question.query();
  const drilledQuery = Lib.drillThru(query, STAGE_INDEX, question.id(), drill);
  const existingFilterCount = Lib.filters(query, STAGE_INDEX).length;
  const newFilters = Lib.filters(drilledQuery, STAGE_INDEX).slice(
    existingFilterCount,
  );
  if (newFilters.length === 0) {
    return null;
  }

  const filteredQuery = newFilters.reduce(
    (nextQuery, filter) => Lib.filter(nextQuery, STAGE_INDEX, filter),
    query,
  );
  return recutClickedBreakouts(
    filteredQuery,
    getBreakoutNames(query),
    dimensions.map((dimension) => dimension.column.name),
  );
}

function recutClickedBreakouts(
  query: Lib.Query,
  breakoutNames: string[],
  clickedNames: string[],
): Lib.Query {
  // last to first, so indexes of the breakouts still to visit don't shift
  return breakoutNames.reduceRight((nextQuery, name, index) => {
    const breakout = Lib.breakouts(nextQuery, STAGE_INDEX)[index];
    if (breakout == null || !clickedNames.includes(name)) {
      return nextQuery;
    }
    const column = Lib.breakoutColumn(nextQuery, STAGE_INDEX, breakout);
    const finerBucket =
      column != null
        ? getFinerBucket(nextQuery, column, Lib.temporalBucket(breakout))
        : null;
    return column != null && finerBucket != null
      ? Lib.replaceClause(
          nextQuery,
          STAGE_INDEX,
          breakout,
          Lib.withTemporalBucket(column, finerBucket),
        )
      : Lib.removeClause(nextQuery, STAGE_INDEX, breakout);
  }, query);
}
