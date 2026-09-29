import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useSettingSwitch } from "metabase/settings";
import { SwitchSettingsSection } from "metabase/settings-components";
import { Box } from "metabase/ui";

export type UserProvisioningSettingKey =
  | "jwt-user-provisioning-enabled?"
  | "ldap-user-provisioning-enabled?"
  | "oidc-user-provisioning-enabled?"
  | "saml-user-provisioning-enabled?";

type UserProvisioningSectionProps = {
  settingKey: UserProvisioningSettingKey;
  // the sign-in method as the description names it
  providerName: string;
  // says why the switch cannot be toggled and keeps it disabled while shown
  lockedNote?: React.ReactNode;
};

export function UserProvisioningSection({
  settingKey,
  providerName,
  lockedNote,
}: UserProvisioningSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const provisioningSwitch = useSettingSwitch(settingKey);
  // a note built as `condition && <Note/>` is `false` when its condition is off, so coerce rather than compare
  const hasLockedNote = Boolean(lockedNote);

  return (
    <SwitchSettingsSection
      title={t`User provisioning`}
      description={t`Allow ${providerName} sign-in to create accounts for new users and reactivate deactivated accounts. When disabled, only users with active ${applicationName} accounts can sign in.`}
      // a caller's note explains the lock, so the env line steps aside
      lockedEnvName={hasLockedNote ? undefined : provisioningSwitch.envName}
      note={
        hasLockedNote && (
          <Box c="text-secondary" mt="sm">
            {lockedNote}
          </Box>
        )
      }
      checked={provisioningSwitch.checked}
      switchDisabled={hasLockedNote || provisioningSwitch.isBusy}
      onChange={provisioningSwitch.onChange}
    />
  );
}
