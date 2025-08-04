import type { DatasetColumn, FieldId, RowValue } from "metabase-types/api";

export type SectionType =
  | "header"
  | "subheader"
  | "highlight-1"
  | "highlight-2"
  | "normal";

export type Section = {
  type: SectionType;
  name: string;
  data: {
    field_id: FieldId;
    column: DatasetColumn;
    value: RowValue;
  }[];
};

export type Content = Section[];

export type SectionFieldsProps = {
  value: FieldId[];
  onChange: (value: FieldId[]) => void;
};
