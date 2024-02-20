import type { FieldReference } from "metabase-types/api";

export type ColumnSetting = {
  name: string;
  enabled: boolean;
  fieldRef: FieldReference;
};

export type EditWidgetData = {
  id: string;
  props: EditWidgetProps;
};

export type EditWidgetProps = {
  initialKey: string;
};
