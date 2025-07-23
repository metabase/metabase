import { useState } from "react";
import { t } from "ttag";

import type { InputProps } from "metabase/common/components/Input";
import { Button, Flex, TextInput } from "metabase/ui";

export interface LicenseInputProps {
  token?: string;
  error?: string;
  onUpdate: (license: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

export const LicenseInput = ({
  disabled,
  token,
  error,
  onUpdate,
  loading,
  placeholder,
}: LicenseInputProps) => {
  const [value, setValue] = useState(token ?? "");

  const handleChange: InputProps["onChange"] = (e) => setValue(e.target.value);

  const handleActivate = () => {
    onUpdate(value);
  };

  const isDisabled = loading || disabled;

  return (
    <>
      <Flex w="100%" gap="sm">
        <TextInput
          w="100%"
          error={error}
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
          onClick={handleActivate}
          style={{ flexShrink: 0 }}
        >
          {value.length || !token ? t`Activate` : t`Remove`}
        </Button>
      </Flex>
    </>
  );
};
