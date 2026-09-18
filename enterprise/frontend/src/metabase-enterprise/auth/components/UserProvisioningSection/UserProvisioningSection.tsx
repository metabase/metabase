import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useAdminSetting } from "metabase/settings";
import {
  SwitchSettingsSection,
  useSwitchWrite,
} from "metabase/settings-components";
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
  // greys the card out on pages that stay read-only until their server settings are saved
  disabled?: boolean;
  // says why the switch cannot be toggled and keeps it disabled while shown
  lockedNote?: React.ReactNode;
};

export function UserProvisioningSection({
  settingKey,
  providerName,
  disabled = false,
  lockedNote,
}: UserProvisioningSectionProps) {
  const applicationName = useSelector(getApplicationName);
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading,
    isFetching,
    startedTimeStamp,
  } = useAdminSetting(settingKey);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  // a note built as `condition && <Note/>` is `false` when its condition is off, so coerce rather than compare
  const hasLockedNote = Boolean(lockedNote);
  const { checked, onChange } = useSwitchWrite({
    storedValue: value ?? false,
    isFetching,
    startedTimeStamp,
    write: async (enabled) => {
      const { error } = await updateSetting({
        key: settingKey,
        value: enabled,
      });
      return error == null;
    },
  });

  return (
    <SwitchSettingsSection
      title={t`User provisioning`}
      description={t`Allow ${providerName} sign-in to create accounts for new users and reactivate deactivated accounts. When disabled, only users with active ${applicationName} accounts can sign in.`}
      // a caller's note explains the lock, so the env line steps aside
      lockedEnvName={hasLockedNote ? undefined : envName}
      note={
        hasLockedNote && (
          <Box c="text-secondary" mt="sm">
            {lockedNote}
          </Box>
        )
      }
      checked={checked}
      disabled={disabled}
      // the lock is only known once the settings list has loaded
      switchDisabled={hasLockedNote || isLoading}
      // holding the switch for the write is what makes a debounce unnecessary
      switchBusy={updateSettingResult.isLoading}
      onChange={onChange}
    />
  );
}
