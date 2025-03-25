import type { MantineSize, TextInputProps } from "metabase/ui";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type { FieldWithMetadata } from "../../types";

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
  };
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}
