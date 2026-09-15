import cx from "classnames";
import { useId } from "react";
import { t } from "ttag";

import {
  GroupMappingList,
  useGroupLookup,
  useGroupMappings,
  useMappingDeletion,
  useMappingEditor,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { settingsApi, useAdminSetting } from "metabase/settings";
import {
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "metabase/settings-components";
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

// mapping names are group DNs, which the backend validates on write
const LDAP_GROUP_DN_EXAMPLE = "cn=people,ou=groups,dc=example,dc=org";

type LdapGroupMappingSectionProps = {
  children: React.ReactNode;
  disabled?: boolean;
} & BoxProps;

export function LdapGroupMappingSection({
  children,
  disabled = false,
  ...boxProps
}: LdapGroupMappingSectionProps) {
  const inputId = useId();
  const descriptionId = useId();
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading,
  } = useAdminSetting("ldap-group-sync");
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  // the env lock is only known once the settings list has loaded
  const isDisabled =
    disabled || envName != null || isLoading || updateSettingResult.isLoading;
  const isChecked = value ?? false;

  const handleChange = async (enabled: boolean) => {
    const patch = dispatch(
      settingsApi.util.updateQueryData(
        "getSessionProperties",
        undefined,
        (draft) => {
          draft["ldap-group-sync"] = enabled;
        },
      ),
    );
    const { error } = await updateSetting({
      key: "ldap-group-sync",
      value: enabled,
    });
    if (error) {
      patch.undo();
    }
  };

  // the card sits inside the page form, so Enter must not reach its submit button
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <SettingsSection
      stackProps={SETTINGS_CARD_STACK_PROPS}
      disabled={disabled}
      {...boxProps}
    >
      <Flex justify="space-between" align="flex-start" gap="lg">
        <Box>
          <Title {...SETTINGS_CARD_TITLE_PROPS}>
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
      {isChecked && !disabled && (
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
  // LDAP users are never tenants, so tenant groups stay out of the picker
  const groupLookup = useGroupLookup({ tenancy: "internal" });
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
