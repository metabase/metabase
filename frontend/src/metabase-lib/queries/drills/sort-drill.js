import { isa } from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import Dimension from "metabase-lib/Dimension";

const INVALID_TYPES = [TYPE.Structured];

export function sortDrill({ question, clicked }) {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return null;
  }

  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    INVALID_TYPES.some(type => isa(clicked.column.base_type, type)) ||
    !clicked.column.source
  ) {
    return null;
  }

  const { column } = clicked;
  const fieldRef = query.fieldReferenceForColumn(column);
  if (!fieldRef) {
    return null;
  }

  const sorts = query.sorts();
  const [sortDirection, sortFieldRef] = sorts[0] ?? [];
  const isAlreadySorted =
    sortFieldRef != null && Dimension.isEqual(fieldRef, sortFieldRef);

  const sortDirections = [];
  if (!isAlreadySorted || sortDirection === "asc") {
    sortDirections.push("desc");
  }
  if (!isAlreadySorted || sortDirection === "desc") {
    sortDirections.push("asc");
  }

  return {
    sortDirections,
  };
}

export function sortDrillQuestion({ question, clicked, sortDirection }) {
  const { column } = clicked;
  const query = question.query();
  const fieldRef = query.fieldReferenceForColumn(column);

  return query.replaceSort([sortDirection, fieldRef]).question();
}
