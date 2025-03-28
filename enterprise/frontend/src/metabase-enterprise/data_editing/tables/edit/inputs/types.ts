import type { MantineSize, TextInputProps } from "metabase/ui";
import type {
  DatasetColumn,
  FieldWithMetadata,
  RowValue,
} from "metabase-types/api";

export interface EditingBodyPrimitiveProps {
  autoFocus?: boolean;
  datasetColumn: DatasetColumn;
  field?: FieldWithMetadata;
  initialValue: RowValue;
  inputProps?: {
    size?: MantineSize;
    variant?: TextInputProps["variant"];
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    error?: TextInputProps["error"];
  };
  onChangeValue?: (value: RowValue) => unknown;
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}
