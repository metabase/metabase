import { useEffect, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useAdminSetting } from "metabase/settings";
import { SwitchSettingsSection } from "metabase/settings-components";
import { Box, Text } from "metabase/ui";

type PendingWrite = { value: boolean; at: number };

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
  // the clicked value, shown until a refetch that started after the write lands
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  // a note built as `condition && <Note/>` is `false` when its condition is off, so coerce rather than compare
  const hasLockedNote = Boolean(lockedNote);
  const isLocked = envName != null || hasLockedNote;

  useEffect(() => {
    // an older refetch can still answer with the previous value, so only a later one counts
    if (
      pendingWrite != null &&
      !isFetching &&
      startedTimeStamp != null &&
      startedTimeStamp >= pendingWrite.at
    ) {
      setPendingWrite(null);
    }
  }, [pendingWrite, isFetching, startedTimeStamp]);

  const handleChange = async (enabled: boolean) => {
    const pending = { value: enabled, at: Date.now() };
    setPendingWrite(pending);
    const { error } = await updateSetting({ key: settingKey, value: enabled });
    if (error) {
      setPendingWrite((current) => (current === pending ? null : current));
    }
  };

  // a caller's note explains the lock, so the env line steps aside
  let note: React.ReactNode = null;
  if (hasLockedNote) {
    note = (
      <Box c="text-secondary" mt="sm">
        {lockedNote}
      </Box>
    );
  } else if (envName != null) {
    note = <Text c="text-secondary" mt="sm">{t`Using ${envName}`}</Text>;
  }

  return (
    <SwitchSettingsSection
      title={t`User provisioning`}
      description={t`Allow ${providerName} sign-in to create accounts for new users and reactivate deactivated accounts. When disabled, only users with active ${applicationName} accounts can sign in.`}
      note={note}
      checked={pendingWrite?.value ?? value ?? false}
      disabled={disabled}
      // the lock is only known once the settings list has loaded
      switchDisabled={isLocked || isLoading}
      // holding the switch for the write is what makes a debounce unnecessary
      switchBusy={updateSettingResult.isLoading}
      onChange={handleChange}
    />
  );
}
