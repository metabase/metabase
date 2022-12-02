import React from "react";
import { t } from "ttag";
import { NumericInputProps } from "metabase/core/components/NumericInput";
import {
  CacheInputMessage,
  CacheInputRoot,
  CacheInput,
} from "./CacheTimeInput.styled";

export interface CacheTimeInputProps extends NumericInputProps {
  message?: string;
}

const CacheTimeInput = ({
  message,
  error,
  ...props
}: CacheTimeInputProps): JSX.Element => {
  return (
    <CacheInputRoot>
      {message && (
        <CacheInputMessage error={error}>{message}</CacheInputMessage>
      )}
      <CacheInput {...props} error={error} placeholder="24" />
      <CacheInputMessage error={error}>{t`hours`}</CacheInputMessage>
    </CacheInputRoot>
  );
};

export default CacheTimeInput;
