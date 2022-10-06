import { isFK, isPK } from "metabase/lib/types";
import { stripId } from "metabase/lib/formatting/strings";

export function foreignKeyDrill({ question, clicked }) {
  const query = question.query();
  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    clicked.value === undefined
  ) {
    return null;
  }

  const { column } = clicked;
  if (isPK(column.semantic_type) || !isFK(column.semantic_type)) {
    return null;
  }

  const columnName = stripId(column.display_name);
  const tableName = query.table().display_name;
  return { columnName, tableName };
}

export function foreignKeyDrillQuestion({ question, clicked }) {
  const { column, value } = clicked;
  return question.filter("=", column, value);
}
