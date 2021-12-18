import React, { useState } from "react";
import { t, jt } from "ttag";
import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import { SectionDescription, SectionHeader } from "../SettingsLicense.styled";
import {
  LicenseErrorMessage,
  LicenseInput,
  LicenseInputContainer,
} from "./LicenseWidget.styled";

const getDescription = (hasLicense: boolean, isValid?: boolean) => {
  if (!hasLicense) {
    return t`Bought a license to unlock advanced functionality? Please enter it below.`;
  }

  if (!isValid) {
    return (
      <>
        {jt`Your license isn’t valid anymore. If you have a new license, please
        enter it below, otherwise please contact ${(
          <ExternalLink href="mailto:support@metabase.com">
            support@metabase.com
          </ExternalLink>
        )}`}
      </>
    );
  }

  return t`Your license is active! Hope you’re enjoying it.`;
};

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
          disabled={!onUpdate}
          onChange={handleChange}
          value={value}
          placeholder={"XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"}
        />
        {onUpdate && (
          <Button
            disabled={isDisabled}
            className="px2"
            onClick={handleActivate}
          >
            Activate
          </Button>
        )}
      </LicenseInputContainer>

      {error && <LicenseErrorMessage>{error}</LicenseErrorMessage>}
    </>
  );
};
