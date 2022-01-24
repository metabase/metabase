import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import {
  LicenseErrorMessage,
  LicenseTextInput,
  LicenseInputContainer,
} from "./LicenseInput.styled";

export interface LicenseInputProps {
  token?: string;
  error?: string;
  onUpdate: (license: string) => void;
  loading?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

export const LicenseInput = ({
  token,
  error,
  onUpdate,
  loading,
  invalid,
  placeholder,
}: LicenseInputProps) => {
  const [value, setValue] = useState(token ?? "");

  const handleChange = (value: string) => setValue(value);

  const handleActivate = () => {
    onUpdate(value);
  };

  return (
    <>
      <LicenseInputContainer>
        <LicenseTextInput
          invalid={invalid}
          data-testid="license-input"
          disabled={loading}
          onChange={handleChange}
          value={value}
          placeholder={
            placeholder ??
            "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          }
        />
        <Button
          disabled={loading}
          data-testid="activate-button"
          className="px2"
          onClick={handleActivate}
        >
          {t`Activate`}
        </Button>
      </LicenseInputContainer>

      {error && <LicenseErrorMessage>{error}</LicenseErrorMessage>}
    </>
  );
};
