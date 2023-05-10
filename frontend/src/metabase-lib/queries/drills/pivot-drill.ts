import {
  ClickObject,
  DimensionValue,
} from "metabase-types/types/Visualization";
import { isAddress, isCategory, isDate } from "metabase-lib/types/utils/isa";
import Question from "metabase-lib/Question";
import Field from "metabase-lib/metadata/Field";
import StructuredQuery, {
  FieldFilterFn,
} from "metabase-lib/queries/StructuredQuery";
import DimensionOptions from "metabase-lib/DimensionOptions";

type DrillOptions = {
  question: Question;
  clicked: ClickObject | undefined;
};

export type PivotDrillResult = {
  query: StructuredQuery;
  dimensions: DimensionValue[];
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
