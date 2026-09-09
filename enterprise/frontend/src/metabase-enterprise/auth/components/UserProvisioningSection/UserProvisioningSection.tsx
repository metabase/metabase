import { useEffect, useId, useState } from "react";
import { t } from "ttag";

import {
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useAdminSetting } from "metabase/settings";
import { Box, Flex, Switch, Text, Title } from "metabase/ui";

import S from "./UserProvisioningSection.module.css";

export type UserProvisioningSettingKey =
  | "jwt-user-provisioning-enabled?"
  | "ldap-user-provisioning-enabled?"
  | "oidc-user-provisioning-enabled?"
  | "saml-user-provisioning-enabled?";

export function UserProvisioningSection({
  settingKey,
  providerName,
  disabled = false,
  lockedNote,
}: {
  settingKey: UserProvisioningSettingKey;
  // the sign-in method as the description names it
  providerName: string;
  // greys the card out on pages that stay read-only until their server settings are saved
  disabled?: boolean;
  // says why the switch cannot be toggled and keeps it disabled while shown
  lockedNote?: React.ReactNode;
}) {
  const inputId = useId();
  const descriptionId = useId();
  const applicationName = useSelector(getApplicationName);
  const {
    value,
    settingDetails,
    updateSetting,
    isLoading,
    isFetching,
    startedTimeStamp,
  } = useAdminSetting(settingKey);
  // the last written value, shown until a refetch that started after the write lands
  const [pendingWrite, setPendingWrite] = useState<{
    value: boolean;
    at: number;
  } | null>(null);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  const hasLockedNote = Boolean(lockedNote);
  const isLocked = envName != null || hasLockedNote;
  // the lock is only known once the settings list has loaded
  const isDisabled = disabled || isLocked || isLoading;

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
    const write = { value: enabled, at: Date.now() };
    setPendingWrite(write);
    const { error } = await updateSetting({ key: settingKey, value: enabled });
    if (error) {
      setPendingWrite((current) => (current === write ? null : current));
    }
  };

  // the card sits inside the page form, so Enter must not reach its submit button
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <SettingsSection disabled={disabled}>
      <Flex justify="space-between" align="flex-start" gap="lg">
        <Box>
          <Title {...SETTINGS_CARD_TITLE_PROPS}>
            {/* the title doubles as the switch's label, so clicking it toggles too */}
            <Text
              component="label"
              htmlFor={inputId}
              className={S.titleLabel}
              data-disabled={isDisabled || undefined}
              inherit
            >
              {t`User provisioning`}
            </Text>
          </Title>
          {/* the notes sit inside the description, so assistive tech hears why the switch is locked */}
          <Box id={descriptionId}>
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {t`Allow ${providerName} sign-in to create accounts for new users and reactivate deactivated accounts. When disabled, only users with active ${applicationName} accounts can sign in.`}
            </Text>
            {/* a caller's note explains the lock, so the env line steps aside */}
            {envName != null && !hasLockedNote && (
              <Text c="text-secondary" mt="sm">{t`Using ${envName}`}</Text>
            )}
            {hasLockedNote && (
              <Box c="text-secondary" mt="sm">
                {lockedNote}
              </Box>
            )}
          </Box>
        </Box>
        <Switch
          id={inputId}
          aria-describedby={descriptionId}
          checked={pendingWrite?.value ?? value ?? false}
          disabled={isDisabled}
          onChange={(event) => handleChange(event.currentTarget.checked)}
          onKeyDown={handleKeyDown}
        />
      </Flex>
    </SettingsSection>
  );
}
