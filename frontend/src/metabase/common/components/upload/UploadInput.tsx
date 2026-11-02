import { type InputHTMLAttributes, forwardRef } from "react";

import { Box } from "metabase/ui";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

interface IUploadInputProps extends InputHTMLAttributes<HTMLInputElement> {
  id?: string;
}

export const UploadInput = forwardRef<HTMLInputElement, IUploadInputProps>(
  function UploadInputRef(
    { id = DEFAULT_UPLOAD_INPUT_ID, ...props }: IUploadInputProps,
    ref,
  ) {
    return (
      <Box
        component="input"
        display="none"
        data-testid={id}
        id={id}
        ref={ref}
        type="file"
        accept="text/csv,text/tab-separated-values"
        {...props}
      />
    );
  },
);
