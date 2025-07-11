import { Input } from "metabase/ui";

import type { ActionInputSharedProps } from "./types";

type ActionInputTextProps = ActionInputSharedProps & {
  classNames?: {
    wrapper?: string;
    textInputElement?: string;
  };
};

export const ActionInputText = ({
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onEscape,
  onEnter,
  onBlur,
  onChange,
}: ActionInputTextProps) => {
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
