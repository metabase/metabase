// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { type InputHTMLAttributes, forwardRef } from "react";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

const StyledUploadInput = styled.input`
  display: none;
`;

interface IUploadInputProps extends InputHTMLAttributes<HTMLInputElement> {
  id?: string;
}

export const UploadInput = forwardRef<HTMLInputElement, IUploadInputProps>(
  function UploadInputRef(
    { id = DEFAULT_UPLOAD_INPUT_ID, ...props }: IUploadInputProps,
    ref,
  ) {
    return (
      <StyledUploadInput
        data-testid={id}
        id={id}
        ref={ref}
        type="file"
        accept="text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls"
        {...props}
      />
    );
  },
);
