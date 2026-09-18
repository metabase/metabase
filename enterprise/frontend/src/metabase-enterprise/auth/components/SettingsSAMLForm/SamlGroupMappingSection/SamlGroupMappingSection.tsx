import { t } from "ttag";

import {
  GroupMappingsPanel,
  useGroupLookup,
  useGroupMappings,
} from "metabase/admin/settings/auth/components/GroupMappings";
import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { settingsApi, useAdminSetting } from "metabase/settings";
import { SwitchSettingsSection } from "metabase/settings-components";
import { type BoxProps, Text } from "metabase/ui";

type SamlGroupMappingSectionProps = {
  children: React.ReactNode;
  disabled?: boolean;
  onToggle?: (enabled: boolean) => void;
} & BoxProps;

export function SamlGroupMappingSection({
  children,
  disabled = false,
  onToggle,
  ...boxProps
}: SamlGroupMappingSectionProps) {
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading,
    isFetching: isAdminSettingsFetching,
  } = useAdminSetting("saml-group-sync");
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;

  const handleChange = async (enabled: boolean) => {
    const patch = dispatch(
      settingsApi.util.updateQueryData(
        "getSessionProperties",
        undefined,
        (draft) => {
          draft["saml-group-sync"] = enabled;
        },
      ),
    );
    const { error } = await updateSetting({
      key: "saml-group-sync",
      value: enabled,
    });
    if (error) {
      patch.undo();
    } else {
      onToggle?.(enabled);
    }
  };

  return (
    <SwitchSettingsSection
      title={t`Group mapping`}
      description={t`Automatically assign people to ${applicationName} groups based on groups from your SAML identity provider`}
      note={
        envName != null && (
          <Text c="text-secondary" mt="sm">{t`Using ${envName}`}</Text>
        )
      }
      checked={value ?? false}
      disabled={disabled}
      // the env lock is only known once the settings list has loaded
      switchDisabled={envName != null || isLoading}
      // a refetch still in flight could answer with the value from before the write
      switchBusy={isAdminSettingsFetching || updateSettingResult.isLoading}
      onChange={handleChange}
      {...boxProps}
    >
      <SamlGroupMappings />
      {children}
    </SwitchSettingsSection>
  );
}

function SamlGroupMappings() {
  const { settingDetails } = useAdminSetting("saml-group-mappings");
  const groupLookup = useGroupLookup();
  const groupMapping = useGroupMappings({ settingKey: "saml-group-mappings" });
  const envName = settingDetails?.is_env_setting
    ? settingDetails.env_name
    : undefined;

  return (
    <GroupMappingsPanel
      groupMapping={groupMapping}
      groupLookup={groupLookup}
      readOnly={envName != null}
      note={
        envName != null && <Text c="text-secondary">{t`Using ${envName}`}</Text>
      }
      nameLabel={t`SAML group name`}
      namePlaceholder={t`Enter SAML group...`}
    />
  );
}
