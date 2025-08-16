import { useTranslateContent } from "metabase/i18n/hooks";
import type {
  DatasetColumn,
  Field,
  ObjectViewSectionSettings,
  RowValues,
} from "metabase-types/api";

import { renderValue } from "../utils";

export type FieldProps = {
  field_id: number;
  columns: DatasetColumn[];
  section: ObjectViewSectionSettings;
  row: RowValues;
};

export function Field({ field_id, columns, section, row }: FieldProps) {
  const tc = useTranslateContent();

  const columnIndex = columns.findIndex((c) => c.id === field_id);
  const column = columns[columnIndex];
  if (!column) {
    return null;
  }

  const value = row[columnIndex];

  switch (section.variant) {
    case "header":
      return <div>{renderValue(tc, value, column)}</div>;
    case "normal":
      return <div>{renderValue(tc, value, column)}</div>;
    case "subheader":
      return <div>{renderValue(tc, value, column)}</div>;
  }
}
