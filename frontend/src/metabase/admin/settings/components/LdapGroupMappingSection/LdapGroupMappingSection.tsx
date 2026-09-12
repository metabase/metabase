import { useDebouncedCallback } from "@mantine/hooks";
import cx from "classnames";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "ttag";

import {
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  GroupMappingList,
  useGroupLookup,
  useGroupMappings,
  useMappingDeletion,
  useMappingEditor,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useAdminSetting } from "metabase/settings";
import {
  Box,
  type BoxProps,
  Button,
  Flex,
  Icon,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";

import S from "./LdapGroupMappingSection.module.css";

// a burst of clicks ends in a single write for the last value
export const GROUP_SYNC_WRITE_DEBOUNCE_MS = 300;

// mapping names are group DNs, which the backend validates on write
const LDAP_GROUP_DN_EXAMPLE = "cn=people,ou=groups,dc=example,dc=org";

// sentAt is set once the debounced write goes out, so only refetches after that can settle it
type PendingWrite = { id: number; value: boolean; sentAt: number | null };

export function LdapGroupMappingSection({
  children,
  ...boxProps
}: {
  children: React.ReactNode;
} & BoxProps) {
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
  } = useAdminSetting("ldap-group-sync");
  // the last chosen value, shown until a refetch that started after its write lands
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const lastWriteId = useRef(0);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  // the lock is only known once the settings list has loaded
  const isDisabled = envName != null || isLoading;
  const isChecked = pendingWrite?.value ?? value ?? false;

  useEffect(() => {
    // a refetch that started before the write can still answer with the previous value
    if (
      pendingWrite?.sentAt != null &&
      !isFetching &&
      startedTimeStamp != null &&
      startedTimeStamp >= pendingWrite.sentAt
    ) {
      setPendingWrite(null);
    }
  }, [pendingWrite, isFetching, startedTimeStamp]);

  // leaving the page flushes a write that is still waiting on the debounce
  const saveGroupSync = useDebouncedCallback(
    async (pending: PendingWrite) => {
      const sentAt = Date.now();
      setPendingWrite((current) =>
        current?.id === pending.id ? { ...current, sentAt } : current,
      );
      const { error } = await updateSetting({
        key: "ldap-group-sync",
        value: pending.value,
      });
      if (error) {
        setPendingWrite((current) =>
          current?.id === pending.id ? null : current,
        );
      }
    },
    { delay: GROUP_SYNC_WRITE_DEBOUNCE_MS, flushOnUnmount: true },
  );

  const handleChange = (enabled: boolean) => {
    lastWriteId.current += 1;
    const pending = { id: lastWriteId.current, value: enabled, sentAt: null };
    setPendingWrite(pending);
    saveGroupSync(pending);
  };

  // the card sits inside the page form, so Enter must not reach its submit button
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <SettingsSection stackProps={SETTINGS_CARD_STACK_PROPS} {...boxProps}>
      <Flex justify="space-between" align="flex-start" gap="lg">
        <Box>
          <Title {...SETTINGS_CARD_TITLE_PROPS}>
            {/* the title doubles as the switch's label, so clicking it toggles too */}
            <Text
              component="label"
              htmlFor={inputId}
              className={cx(S.titleLabel, isDisabled && S.disabled)}
              inherit
            >
              {t`Group mapping`}
            </Text>
          </Title>
          {/* the env line sits inside the description, so assistive tech hears why the switch is locked */}
          <Box id={descriptionId}>
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {t`Automatically assign people to ${applicationName} groups based on their LDAP group membership`}
            </Text>
            {envName != null && (
              <Text c="text-secondary" mt="sm">{t`Using ${envName}`}</Text>
            )}
          </Box>
        </Box>
        <Switch
          id={inputId}
          aria-describedby={descriptionId}
          checked={isChecked}
          disabled={isDisabled}
          onChange={(event) => handleChange(event.currentTarget.checked)}
          onKeyDown={handleKeyDown}
        />
      </Flex>
      {isChecked && (
        <Stack gap="lg">
          <LdapGroupMappings />
          {children}
        </Stack>
      )}
    </SettingsSection>
  );
}

function LdapGroupMappings() {
  const { settingDetails } = useAdminSetting("ldap-group-mappings");
  const groupLookup = useGroupLookup();
  const groupMapping = useGroupMappings({ settingKey: "ldap-group-mappings" });
  const deletion = useMappingDeletion({ groupMapping, groupLookup });
  const editor = useMappingEditor({ groupMapping, groupLookup });
  const isBusy = groupMapping.isSaving || deletion.isDeleting;
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  const isLocked = envName != null;

  return (
    <Stack gap="sm">
      <Flex justify="space-between" align="center" gap="lg">
        <Text fw="bold">{t`Manual group mappings`}</Text>
        {!isLocked && editor.draft == null && (
          <Button
            variant="subtle"
            leftSection={<Icon name="add" aria-hidden />}
            disabled={isBusy}
            onClick={editor.startNew}
          >{t`New`}</Button>
        )}
      </Flex>
      {envName != null && <Text c="text-secondary">{t`Using ${envName}`}</Text>}
      <GroupMappingList
        groupMapping={groupMapping}
        groupLookup={groupLookup}
        editor={editor}
        deletion={deletion}
        readOnly={isLocked}
        disabled={isBusy}
        nameLabel={t`LDAP group name`}
        namePlaceholder={LDAP_GROUP_DN_EXAMPLE}
        emptyMessage={t`No mappings yet`}
      />
    </Stack>
  );
}
