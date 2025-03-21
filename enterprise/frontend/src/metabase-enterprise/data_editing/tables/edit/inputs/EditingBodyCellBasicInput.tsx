import { Input } from "metabase/ui";

import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellBasicInput = ({
  autoFocus,
  inputProps,
  initialValue,
  onSubmit,
  onCancel,
}: EditingBodyPrimitiveProps) => {
  return (
    <Input
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={event => {
        if (event.key === "Escape") {
          onCancel();
        } else if (event.key === "Enter") {
          onSubmit(event.currentTarget.value);
        }
      }}
      onBlur={event => {
        onSubmit(event.currentTarget.value);
      }}
      {...inputProps}
    />
  );
};
