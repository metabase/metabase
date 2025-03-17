import { Input } from "metabase/ui";

import S from "./EditingBodyCellInput.module.css";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellBasicInput = ({
  initialValue,
  onSubmit,
  onCancel,
}: EditingBodyPrimitiveProps) => {
  return (
    <Input
      defaultValue={(initialValue ?? "").toString()}
      className={S.input}
      variant="unstyled"
      size="xs"
      autoFocus
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
    />
  );
};
