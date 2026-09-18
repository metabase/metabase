import { t } from "ttag";

import { useAdminSetting } from "metabase/settings";
import {
  SwitchSettingsSection,
  useSwitchWrite,
} from "metabase/settings-components";
import type { BoxProps } from "metabase/ui";

import { GroupMappingsPanel } from "./GroupMappingsPanel";
import { useGroupLookup } from "./use-group-lookup";
import {
  type GroupMappingsSettingKey,
  useGroupMappings,
} from "./use-group-mappings";

type GroupSyncSettingKey = "ldap-group-sync" | "saml-group-sync";

type SettingsGroupMappingSectionProps = {
  syncSettingKey: GroupSyncSettingKey;
  mappingsSettingKey: GroupMappingsSettingKey;
  description: string;
  // "internal" keeps tenant groups out of the picker, for providers whose users are never tenants
  tenancy?: "internal";
  nameLabel: string;
  namePlaceholder: string;
  // the page form's fields that only apply while group mapping is on
  children: React.ReactNode;
  disabled?: boolean;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

/** The group mapping card of a provider whose switch and mappings are two settings */
export function SettingsGroupMappingSection({
  syncSettingKey,
  mappingsSettingKey,
  description,
  tenancy,
  nameLabel,
  namePlaceholder,
  children,
  disabled = false,
  onToggle,
  ...boxProps
}: SettingsGroupMappingSectionProps) {
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading,
    isFetching,
    startedTimeStamp,
  } = useAdminSetting(syncSettingKey);
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;
  const { checked, onChange } = useSwitchWrite({
    storedValue: value ?? false,
    isFetching,
    startedTimeStamp,
    write: async (enabled) => {
      const { error } = await updateSetting({
        key: syncSettingKey,
        value: enabled,
      });
      if (error) {
        return false;
      }
      onToggle?.(enabled);
      return true;
    },
  });

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={description}
      lockedEnvName={envName}
      checked={checked}
      disabled={disabled}
      // the env lock is only known once the settings list has loaded
      switchDisabled={isLoading}
      // a refetch still in flight could answer with the value from before the write
      switchBusy={isFetching || updateSettingResult.isLoading}
      onChange={onChange}
      {...boxProps}
    >
      <SettingsGroupMappings
        settingKey={mappingsSettingKey}
        tenancy={tenancy}
        nameLabel={nameLabel}
        namePlaceholder={namePlaceholder}
      />
      {children}
    </SwitchSettingsSection>
  );
}

type SettingsGroupMappingsProps = {
  settingKey: GroupMappingsSettingKey;
  tenancy?: "internal";
  nameLabel: string;
  namePlaceholder: string;
};

function SettingsGroupMappings({
  settingKey,
  tenancy,
  nameLabel,
  namePlaceholder,
}: SettingsGroupMappingsProps) {
  const { settingDetails } = useAdminSetting(settingKey);
  const groupLookup = useGroupLookup({ tenancy });
  const groupMapping = useGroupMappings({ settingKey });
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;

  return (
    <GroupMappingsPanel
      groupMapping={groupMapping}
      groupLookup={groupLookup}
      lockedEnvName={envName}
      nameLabel={nameLabel}
      namePlaceholder={namePlaceholder}
    />
  );
}
