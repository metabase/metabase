import type {
  DatasetColumn,
  FieldId,
  RowValue,
  SectionVariant,
} from "metabase-types/api";
export type { SectionVariant } from "metabase-types/api";

export type Section = {
  id: number;
  title: string;
  variant: SectionVariant;
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
