import React, { useCallback } from "react";
import { t } from "ttag";
import { Settings } from "metabase-types/api";
import AuthCard from "../AuthCard";
import { GOOGLE_SCHEMA } from "../../constants";

export interface GoogleAuthSetting {
  value: boolean | null;
}

export interface GoogleAuthCardProps {
  setting: GoogleAuthSetting;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onChangeSettings: (values: Partial<Settings>) => void;
}

const GoogleAuthCard = ({
  setting,
  isConfigured,
  onChange,
  onChangeSettings,
}: GoogleAuthCardProps): JSX.Element => {
  const handleDeactivate = useCallback(async () => {
    await onChangeSettings?.(GOOGLE_SCHEMA.getDefault());
  }, [onChangeSettings]);

  return (
    <AuthCard
      type="google"
      name={t`Google Sign-in`}
      title={t`Sign in with Google`}
      description={t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
      isEnabled={setting.value ?? false}
      isConfigured={isConfigured}
      onChange={onChange}
      onDeactivate={handleDeactivate}
    />
  );
};

export default GoogleAuthCard;
