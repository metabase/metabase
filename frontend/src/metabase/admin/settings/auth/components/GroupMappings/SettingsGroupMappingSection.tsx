import { t } from "ttag";

import { useAdminSetting, useSettingSwitch } from "metabase/settings";
import { SwitchSettingsSection } from "metabase/settings-components";
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
  tenancy?: "internal";
  namesValidatedOnSave?: boolean;
  nameLabel: string;
  namePlaceholder: string;
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
  namesValidatedOnSave,
  nameLabel,
  namePlaceholder,
  children,
  disabled = false,
  onToggle,
  ...boxProps
}: SettingsGroupMappingSectionProps) {
  const groupSyncSwitch = useSettingSwitch(syncSettingKey, { onToggle });
  const isLockedUntilSave = disabled && groupSyncSwitch.envName === undefined;

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={description}
      lockedEnvName={groupSyncSwitch.envName}
      note={
        isLockedUntilSave && t`Save the settings above to set up group mapping.`
      }
      checked={groupSyncSwitch.checked}
      disabled={disabled}
      switchDisabled={groupSyncSwitch.isBusy}
      onChange={groupSyncSwitch.onChange}
      {...boxProps}
    >
      <SettingsGroupMappings
        settingKey={mappingsSettingKey}
        tenancy={tenancy}
        namesValidatedOnSave={namesValidatedOnSave}
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
  namesValidatedOnSave?: boolean;
  nameLabel: string;
  namePlaceholder: string;
};

function SettingsGroupMappings({
  settingKey,
  tenancy,
  namesValidatedOnSave,
  nameLabel,
  namePlaceholder,
}: SettingsGroupMappingsProps) {
  const { settingDetails, isFetching } = useAdminSetting(settingKey);
  const groupLookup = useGroupLookup({ tenancy });
  const { mappings, saveMappings } = useGroupMappings({ settingKey });
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;

  return (
    <GroupMappingsPanel
      mappings={mappings}
      saveMappings={saveMappings}
      groupLookup={groupLookup}
      disabled={isFetching}
      lockedEnvName={envName}
      namesValidatedOnSave={namesValidatedOnSave}
      nameLabel={nameLabel}
      namePlaceholder={namePlaceholder}
    />
  );
}
