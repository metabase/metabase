import { type ChangeEventHandler, forwardRef } from "react";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

interface IUploadInputProps {
  id?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export const UploadInput = forwardRef<HTMLInputElement, IUploadInputProps>(
  function UploadInputRef(
    { id = DEFAULT_UPLOAD_INPUT_ID, onChange }: IUploadInputProps,
    ref,
  ) {
    return (
      <input
        style={{ display: "none" }}
        data-testid={id}
        id={id}
        ref={ref}
        type="file"
        accept="text/csv"
        onChange={onChange}
      />
    );
  },
);
