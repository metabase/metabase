import { Textarea } from "metabase/ui";

import type { EditingBodyPrimitiveProps } from "./types";

const MAX_ROWS = 8;
const MIN_ROWS = 1;

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
      // Match the line height for single line text (should look like a regular input)
      styles={{ input: { lineHeight: "165%" } }}
      maxRows={MAX_ROWS}
      minRows={MIN_ROWS}
      autosize
    />
  );
};
