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


/*


today:

U: dropdown component to add/remove columns
S: 1 type of section
K: persistence

------>

main:
- render a list of sections
- 5 types of sections


sidebar:
- persistence
- predefined sections
- adding/removing columns to/from sections
- move relationships to sidebar
- move actions from the card to nav

*/
