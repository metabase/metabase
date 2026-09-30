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
  const groupSyncSwitch = useSettingSwitch(syncSettingKey, { onToggle });

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={description}
      lockedEnvName={groupSyncSwitch.envName}
      checked={groupSyncSwitch.checked}
      disabled={disabled}
      switchDisabled={groupSyncSwitch.isBusy}
      onChange={groupSyncSwitch.onChange}
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
      nameLabel={nameLabel}
      namePlaceholder={namePlaceholder}
    />
  );
}
