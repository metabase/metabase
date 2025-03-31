import { forwardRef } from "react";

import type { InputProps } from "metabase/core/components/Input";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

export const UploadInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "size">
>(function UploadInput({ id = DEFAULT_UPLOAD_INPUT_ID, ...inputProps }, ref) {
  return (
    <input
      data-testid={id}
      ref={ref}
      type="file"
      style={{ display: "none" }}
      {...{
        id,
        accept: "text/csv",
        ...inputProps,
      }}
    />
  );
});
