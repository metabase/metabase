import { Textarea } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";

const DEFAULT_MAX_ROWS = 8;
const DEFAULT_MIN_ROWS = 1;

export type TableActionInputTextareaProps = TableActionInputSharedProps & {
  minRows?: number;
  maxRows?: number;
  classNames?: {
    wrapper?: string;
    textInputElement?: string;
  };
};

export const TableActionInputTextarea = ({
  minRows = DEFAULT_MIN_ROWS,
  maxRows = DEFAULT_MAX_ROWS,
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onBlur,
  onEscape,
  onChange,
}: TableActionInputTextareaProps) => {
  return (
    <Textarea
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={(event) => {
        if (event.key === "Escape") {
          onEscape?.(event.currentTarget.value);
        }
        // We skip handling Enter here because it might break the
        // default behavior of the Textarea and we don't want to
        // override it.
      }}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
      }}
      onBlur={(event) => {
        onBlur?.(event.currentTarget.value);
      }}
      classNames={{
        wrapper: classNames?.wrapper,
        input: classNames?.textInputElement,
      }}
      {...inputProps}
      // Match the line height for single line text (should look like a regular input)
      styles={{ input: { lineHeight: "165%" } }}
      maxRows={maxRows}
      minRows={minRows}
      autosize
    />
  );
};
