import type Field from "metabase-lib/v1/metadata/Field";

export interface CategoryWidgetProps {
  value: string;
  onChange: (value: string | null) => void;
  field: Field;
}
