import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useSettingSwitch } from "metabase/settings";
import { SwitchSettingsSection } from "metabase/settings-components";

export type UserProvisioningSettingKey =
  | "jwt-user-provisioning-enabled?"
  | "ldap-user-provisioning-enabled?"
  | "oidc-user-provisioning-enabled?"
  | "saml-user-provisioning-enabled?";

type UserProvisioningSectionProps = {
  settingKey: UserProvisioningSettingKey;
  // the sign-in method as the description names it
  providerName: string;
  reactivatesAccounts?: boolean;
  // says why the switch cannot be toggled and keeps it disabled while shown
  lockedNote?: React.ReactNode;
};

export function UserProvisioningSection({
  settingKey,
  providerName,
  reactivatesAccounts = false,
  lockedNote,
}: UserProvisioningSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const provisioningSwitch = useSettingSwitch(settingKey);
  const hasLockedNote = Boolean(lockedNote);
  const description = reactivatesAccounts
    ? t`Allow ${providerName} sign-in to create accounts for new users and reactivate deactivated accounts. When disabled, only users with active ${applicationName} accounts can sign in.`
    : t`Allow ${providerName} sign-in to create accounts for new users. When disabled, only users with active ${applicationName} accounts can sign in.`;

  return (
    <SwitchSettingsSection
      title={t`User provisioning`}
      description={description}
      lockedEnvName={hasLockedNote ? undefined : provisioningSwitch.envName}
      note={lockedNote}
      checked={provisioningSwitch.checked}
      switchDisabled={hasLockedNote || provisioningSwitch.isBusy}
      onChange={provisioningSwitch.onChange}
    />
  );
}
