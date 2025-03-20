import type { MantineSize, TextInputProps } from "metabase/ui";
import type { DatasetColumn, RowValue } from "metabase-types/api";

export interface EditingBodyPrimitiveProps {
  autoFocus?: boolean;
  datasetColumn: DatasetColumn;
  initialValue: RowValue;
  inputProps?: {
    size?: MantineSize;
    variant: TextInputProps["variant"];
    className?: string;
    placeholder?: string;
  };
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}
