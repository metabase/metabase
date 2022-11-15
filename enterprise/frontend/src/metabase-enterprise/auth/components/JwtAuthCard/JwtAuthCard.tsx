import React, { useCallback } from "react";
import { t } from "ttag";
import { Settings } from "metabase-types/api";
import AuthCard from "metabase/admin/settings/auth/components/AuthCard";
import { JWT_SCHEMA } from "../../constants";

export interface JwtAuthSetting {
  value: boolean | null;
}

export interface JwtAuthCardProps {
  setting: JwtAuthSetting;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onChangeSettings: (values: Partial<Settings>) => void;
}

const JwtAuthCard = ({
  setting,
  isConfigured,
  onChange,
  onChangeSettings,
}: JwtAuthCardProps): JSX.Element => {
  const handleDeactivate = useCallback(async () => {
    await onChangeSettings(JWT_SCHEMA.getDefault());
  }, [onChangeSettings]);

  return (
    <AuthCard
      type="jwt"
      name={t`JWT`}
      description={t`Allows users to login via a JWT Identity Provider.`}
      isEnabled={setting.value ?? false}
      isConfigured={isConfigured}
      onChange={onChange}
      onDeactivate={handleDeactivate}
    />
  );
};

export default JwtAuthCard;
