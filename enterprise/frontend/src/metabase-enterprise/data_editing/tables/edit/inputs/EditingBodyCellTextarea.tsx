import { Textarea } from "metabase/ui";

import type { EditingBodyPrimitiveProps } from "./types";

const MAX_ROWS = 8;
const MIN_ROWS = 2;

export const EditingBodyCellTextarea = ({
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onSubmit,
  onCancel,
  onChangeValue,
}: EditingBodyPrimitiveProps) => {
  return (
    <Textarea
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
      onChange={(event) => {
        // Convert empty string to null
        onChangeValue?.(event.currentTarget.value || null);
      }}
      onBlur={(event) => {
        onSubmit(event.currentTarget.value || null);
      }}
      classNames={{
        wrapper: classNames?.wrapper,
        input: classNames?.textInputElement,
      }}
      {...inputProps}
      maxRows={MAX_ROWS}
      minRows={MIN_ROWS}
      autosize
    />
  );
};
