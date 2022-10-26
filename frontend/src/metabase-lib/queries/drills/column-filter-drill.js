import { isa } from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";

const INVALID_TYPES = [TYPE.Structured];

export function columnFilterDrill({ question, clicked }) {
  const query = question.query();

  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    INVALID_TYPES.some(type => isa(clicked.column.base_type, type)) ||
    clicked.column.field_ref == null ||
    clicked.value !== undefined
  ) {
    return null;
  }

  const { dimension } = clicked;
  const initialFilter = dimension.defaultFilterForDimension();

  return { query, initialFilter };
}
