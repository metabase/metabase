import styled from "@emotion/styled";
import { forwardRef, type ChangeEventHandler } from "react";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

const StyledUploadInput = styled.input`
  display: none;
`;

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
      <StyledUploadInput
        data-testid={id}
        id={id}
        ref={ref}
        type="file"
        accept="text/csv,text/tab-separated-values"
        onChange={onChange}
      />
    );
  },
);
