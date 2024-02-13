import _ from "underscore";
import { FieldDimension } from "metabase-lib/Dimension";

export function getPivotColumnSplit(question) {
  const setting = question.setting("pivot_table.column_split");
  const breakout =
    (question.isStructured() &&
      question.legacyQuery({ useStructuredQuery: true }).breakouts()) ||
    [];
  const { rows: pivot_rows, columns: pivot_cols } = _.mapObject(
    setting,
    fieldRefs =>
      fieldRefs
        .map(field_ref =>
          breakout.findIndex(b =>
            _.isEqual(canonicalFieldRef(b), canonicalFieldRef(field_ref)),
          ),
        )
        .filter(index => index !== -1),
  );

  return { pivot_rows, pivot_cols };
}

function canonicalFieldRef(ref) {
  // Field refs between the query and setting might differ slightly.
  // This function trims binned dimensions to just the field-id
  const dimension = FieldDimension.parseMBQL(ref);
  if (!dimension) {
    return ref;
  }
  return dimension.withoutOptions("binning").mbql();
}
