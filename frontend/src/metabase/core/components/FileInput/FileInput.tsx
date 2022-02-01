import React, { ChangeEvent, FocusEvent } from "react";

export interface FileInputProps {
  className?: string;
  name?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const FileInput = (): JSX.Element => {
  return <div />;
};

export default FileInput;
