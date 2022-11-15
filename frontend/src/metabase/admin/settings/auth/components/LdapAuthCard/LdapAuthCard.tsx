import React, { useCallback } from "react";
import { t } from "ttag";
import { Settings } from "metabase-types/api";
import AuthCard from "../AuthCard";
import { LDAP_SCHEMA } from "../../constants";

export interface LdapAuthSetting {
  value: boolean | null;
}

export interface LdapAuthCardProps {
  setting: LdapAuthSetting;
  isConfigured: boolean;
  isSsoEnabled: boolean;
  onChange: (value: boolean) => void;
  onChangeSettings: (values: Partial<Settings>) => void;
}

const LdapAuthCard = ({
  setting,
  isConfigured,
  isSsoEnabled,
  onChange,
  onChangeSettings,
}: LdapAuthCardProps): JSX.Element => {
  const handleDeactivate = useCallback(async () => {
    const defaults = LDAP_SCHEMA.getDefault({ context: { isSsoEnabled } });
    await onChangeSettings?.(defaults);
  }, [isSsoEnabled, onChangeSettings]);

  return (
    <AuthCard
      type="ldap"
      name={t`LDAP`}
      description={t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`}
      isEnabled={setting.value ?? false}
      isConfigured={isConfigured}
      onChange={onChange}
      onDeactivate={handleDeactivate}
    />
  );
};

export default LdapAuthCard;
