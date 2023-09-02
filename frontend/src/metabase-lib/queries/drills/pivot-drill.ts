import { isAddress, isCategory, isDate } from "metabase-lib/types/utils/isa";
import type Question from "metabase-lib/Question";
import type Field from "metabase-lib/metadata/Field";
/* eslint-disable import/no-duplicates */
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { FieldFilterFn } from "metabase-lib/queries/StructuredQuery";
/* eslint-enable import/no-duplicates */
import type {
  ClickObject,
  ClickObjectDimension,
} from "metabase-lib/queries/drills/types";
import type DimensionOptions from "metabase-lib/DimensionOptions";

type DrillOptions = {
  question: Question;
  clicked: ClickObject | undefined;
};

export type PivotDrillResult = {
  query: StructuredQuery;
  dimensions: ClickObjectDimension[];
  breakoutOptions: DimensionOptions;
};

function pivotDrill({
  question,
  clicked,
  fieldFilter,
}: DrillOptions & {
  fieldFilter: FieldFilterFn;
}): PivotDrillResult | null {
  const query = question.query() as StructuredQuery;
  if (!question.isStructured() || !query.isEditable()) {
    return null;
  }

  if (
    clicked &&
    (clicked.value === undefined || clicked.column?.source !== "aggregation")
  ) {
    return null;
  }

  const breakoutOptions = query.breakoutOptions(null, fieldFilter);
  if (breakoutOptions.count === 0) {
    return null;
  }

  const dimensions = (clicked && clicked.dimensions) || [];
  return { query, dimensions, breakoutOptions };
}

export function pivotByTimeDrill({ question, clicked }: DrillOptions) {
  const fieldFilter = (field: Field) => isDate(field);
  return pivotDrill({ question, clicked, fieldFilter });
}

export function pivotByLocationDrill({ question, clicked }: DrillOptions) {
  const fieldFilter = (field: Field) => isAddress(field);
  return pivotDrill({ question, clicked, fieldFilter });
}

export function pivotByCategoryDrill({ question, clicked }: DrillOptions) {
  const fieldFilter = (field: Field) => isCategory(field) && !isAddress(field);
  return pivotDrill({ question, clicked, fieldFilter });
}
