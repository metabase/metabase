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
  onUpdate: (license: string) => void;
  loading?: boolean;
  invalid?: boolean;
}

export const LicenseWidget = ({
  token,
  description,
  error,
  onUpdate,
  loading,
  invalid,
}: LicenseWidgetProps) => {
  const [value, setValue] = useState(token ?? "");

  const handleChange = (value: string) => setValue(value);

  const handleActivate = () => {
    onUpdate(value);
  };

  return (
    <>
      <SectionHeader>{t`License`}</SectionHeader>

      <SectionDescription>{description}</SectionDescription>

      <LicenseInputContainer>
        <LicenseInput
          invalid={invalid}
          data-testid="license-input"
          disabled={loading}
          onChange={handleChange}
          value={value}
          placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
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
