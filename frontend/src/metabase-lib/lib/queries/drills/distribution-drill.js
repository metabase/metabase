import { isa } from "metabase-lib/lib/types/utils/isa";
import { TYPE } from "metabase-lib/lib/types/constants";

const DENYLIST_TYPES = [
  TYPE.PK,
  TYPE.SerializedJSON,
  TYPE.Description,
  TYPE.Comment,
];

export function distributionDrill({ question, clicked }) {
  return !(
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    DENYLIST_TYPES.some(t => isa(clicked.column.semantic_type, t)) ||
    !question.query().isEditable()
  );
}

export function distributionDrillQuestion({ question, clicked }) {
  const { column } = clicked;
  return question.distribution(column);
}
