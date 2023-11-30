import { isa } from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import type Question from "metabase-lib/Question";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import type Filter from "metabase-lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

const INVALID_TYPES = [TYPE.Structured];

export function columnFilterDrill({
  question,
  clicked,
}: {
  question: Question;
  clicked: ClickObject | undefined;
}): {
  query: StructuredQuery;
  initialFilter?: Filter;
} | null {
  const query = question.query();

  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    INVALID_TYPES.some(
      type => clicked.column?.base_type && isa(clicked.column?.base_type, type),
    ) ||
    clicked.column.field_ref == null ||
    clicked.value !== undefined
  ) {
    return null;
  }

  const { dimension } = clicked as any;
  const initialFilter = dimension?.defaultFilterForDimension();

  return { query: query as StructuredQuery, initialFilter };
}
