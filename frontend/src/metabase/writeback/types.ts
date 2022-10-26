import Field from "metabase-lib/metadata/Field";

export interface CategoryWidgetProps {
  field: {
    value: string;
    onChange: (value: string) => void;
  };
  formField: {
    fieldInstance: Field;
  };
}
