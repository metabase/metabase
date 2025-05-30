import type { MantineSize, TextInputProps } from "metabase/ui";
import type {
  DatasetColumn,
  FieldWithMetadata,
  RowValue,
} from "metabase-types/api";

export type EditingBodyCellConditionalStylesNames =
  | "wrapper"
  | "textInputElement"
  | "selectTextInputElement"
  | "dateTextInputElement";

export interface EditingBodyPrimitiveProps {
  withTextarea?: boolean;
  autoFocus?: boolean;
  datasetColumn: DatasetColumn;
  field?: FieldWithMetadata;
  initialValue: RowValue;
  inputProps?: {
    size?: MantineSize;
    variant?: TextInputProps["variant"];
    placeholder?: string;
    disabled?: boolean;
    error?: TextInputProps["error"];
    rightSection?: TextInputProps["rightSection"];
    rightSectionPointerEvents?: TextInputProps["rightSectionPointerEvents"];
  };
  classNames?: { [key in EditingBodyCellConditionalStylesNames]?: string };
  onChangeValue?: (value: RowValue) => unknown;
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}
