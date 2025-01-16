import { forwardRef } from "react";

import type { InputProps } from "metabase/core/components/Input";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

export const UploadInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "size">
>(function UploadInput(inputProps, ref) {
  return (
    <input
      data-testid={inputProps.id}
      ref={ref}
      type="file"
      style={{ display: "none" }}
      {...{
        id: DEFAULT_UPLOAD_INPUT_ID,
        accept: "text/csv,text/tab-separated-values",
        ...inputProps,
      }}
    />
  );
});
