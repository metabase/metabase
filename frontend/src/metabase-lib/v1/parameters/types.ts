import type { RemappableField } from "metabase-lib/v1/metadata/utils/remapping";
import type {
  FieldFormattingSettings,
  FieldValue,
  FieldValuesType,
  Parameter,
  ParameterTarget,
  ParameterValueOrArray,
  TableId,
} from "metabase-types/api";

/**
 * What a parameter widget reads off a field it filters on.
 *
 * The API field and the v1 `Field` wrapper both match it. They are not
 * assignable to each other, because the wrapper hydrates `table` into a v1
 * `Table`, so the parameter pipeline names the fields it reads instead.
 */
export interface ParameterField extends RemappableField<ParameterField> {
  name: string;
  display_name: string;
  table_id: TableId;
  has_field_values: FieldValuesType;
  has_more_values?: boolean;
  values?: FieldValue[];
  settings?: FieldFormattingSettings;
}

interface ValuePopulatedParameter extends ParameterWithTemplateTagTarget {
  value?: ParameterValueOrArray | null;
}

export interface FieldFilterUiParameter extends ValuePopulatedParameter {
  fields: ParameterField[];
}

export type UiParameter = (FieldFilterUiParameter | ValuePopulatedParameter) & {
  hidden?: boolean;
};

export interface ParameterWithTarget extends Parameter {
  target: ParameterTarget;
}

export interface ParameterWithTemplateTagTarget extends Parameter {
  hasVariableTemplateTagTarget?: boolean;
}
