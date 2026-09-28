import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { settingsApi, useAdminSetting } from "metabase/settings";
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
  const dispatch = useDispatch();
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isFetching,
  } = useAdminSetting(settingKey);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  // a note built as `condition && <Note/>` is `false` when its condition is off, so coerce rather than compare
  const hasLockedNote = Boolean(lockedNote);

  const handleChange = async (enabled: boolean) => {
    // show the click at once and let the write's refetch confirm it
    const patch = dispatch(
      settingsApi.util.updateQueryData(
        "getSessionProperties",
        undefined,
        (draft) => {
          draft[settingKey] = enabled;
        },
      ),
    );
    const { error } = await updateSetting({ key: settingKey, value: enabled });
    if (error) {
      patch.undo();
    }
  };

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
      checked={value ?? false}
      disabled={disabled}
      // held while the settings load or refetch and while the write runs, so no debounce is needed
      switchDisabled={
        hasLockedNote || isFetching || updateSettingResult.isLoading
      }
      onChange={handleChange}
    />
  );
}
