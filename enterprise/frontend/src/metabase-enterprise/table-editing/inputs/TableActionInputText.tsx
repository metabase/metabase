import { Input } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";

export type TableActionInputTextProps = TableActionInputSharedProps & {
  classNames?: {
    wrapper?: string;
    textInputElement?: string;
  };
};

export const TableActionInputText = ({
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onEscape,
  onEnter,
  onBlur,
  onChange,
}: TableActionInputTextProps) => {
  return (
    <Input
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={(event) => {
        if (event.key === "Escape") {
          onEscape?.(event.currentTarget.value);
        } else if (event.key === "Enter") {
          onEnter?.(event.currentTarget.value);
        }
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
    />
  );
};
