import { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { InputProps } from "metabase/core/components/Input";
import {
  LicenseErrorMessage,
  LicenseTextInput,
  LicenseInputContainer,
} from "./LicenseInput.styled";

export interface LicenseInputProps {
  token?: string;
  error?: string;
  onUpdate: (license: string) => void;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

export const LicenseInput = ({
  disabled,
  token,
  error,
  onUpdate,
  loading,
  invalid,
  placeholder,
}: LicenseInputProps) => {
  const [value, setValue] = useState(token ?? "");

  const handleChange: InputProps["onChange"] = e => setValue(e.target.value);

  const handleActivate = () => {
    onUpdate(value);
  };

  const isDisabled = loading || disabled;

  return (
    <>
      <LicenseInputContainer>
        <LicenseTextInput
          fullWidth
          error={invalid}
          data-testid="license-input"
          disabled={isDisabled}
          onChange={handleChange}
          value={value}
          placeholder={
            placeholder ??
            "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          }
        />
        <Button
          disabled={isDisabled}
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
