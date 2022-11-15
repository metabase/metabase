import React, { useCallback } from "react";
import { t } from "ttag";
import { Settings } from "metabase-types/api";
import AuthCard from "../AuthCard";
import { LDAP_SCHEMA, LDAP_EXTENDED_SCHEMA } from "../../constants";

export interface LdapAuthSetting {
  value: boolean | null;
}

export interface LdapAuthCardProps {
  setting: LdapAuthSetting;
  isExtended: boolean;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onChangeSettings: (values: Partial<Settings>) => void;
}

const LdapAuthCard = ({
  setting,
  isExtended,
  isConfigured,
  onChange,
  onChangeSettings,
}: LdapAuthCardProps): JSX.Element => {
  const handleDeactivate = useCallback(async () => {
    const schema = isExtended ? LDAP_EXTENDED_SCHEMA : LDAP_SCHEMA;
    await onChangeSettings(schema.getDefault());
  }, [isExtended, onChangeSettings]);

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
