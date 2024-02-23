import { TYPE } from "metabase-lib/types/constants";
import { isa } from "metabase-lib/types/utils/isa";

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
