import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import {
  SectionDescription,
  SectionHeader,
} from "metabase/admin/settings/components/SettingsLicense/SettingsLicense.styled";
import {
  LicenseErrorMessage,
  LicenseInput,
  LicenseInputContainer,
} from "./LicenseWidget.styled";
export interface LicenseWidgetProps {
  token?: string;
  description: React.ReactNode;
  error?: string;
  onUpdate?: (license: string) => void;
  loading?: boolean;
}

export const LicenseWidget = ({
  token,
  description,
  error,
  onUpdate,
  loading,
}: LicenseWidgetProps) => {
  const [value, setValue] = useState(token ?? "");

  const handleChange = (value: string) => setValue(value);

  const handleActivate = () => {
    onUpdate?.(value);
  };

  const isDisabled = value.length === 0 || loading;

  return (
    <>
      <SectionHeader>License</SectionHeader>

      <SectionDescription>{description}</SectionDescription>

      <LicenseInputContainer>
        <LicenseInput
          data-testid="license-input"
          disabled={!onUpdate}
          onChange={handleChange}
          value={value}
          placeholder={"XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"}
        />
        {onUpdate && (
          <Button
            data-testid="activate-button"
            disabled={isDisabled}
            className="px2"
            onClick={handleActivate}
          >
            {t`Activate`}
          </Button>
        )}
      </LicenseInputContainer>

      {error && <LicenseErrorMessage>{error}</LicenseErrorMessage>}
    </>
  );
};
