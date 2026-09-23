import { t } from "ttag";

import { useAdminSetting } from "metabase/settings";
import { SettingsSection } from "metabase/settings-components";
import { Switch } from "metabase/ui";

import { WORKSPACES_ENABLED_SETTING } from "../../constants";

/**
 * Saves on toggle rather than with the surrounding form, which posts one closed payload of remote-sync settings
 * only.
 */
export const WorkspaceToggleSection = () => {
  const { value, updateSetting, settingDetails, isLoading } = useAdminSetting(
    WORKSPACES_ENABLED_SETTING,
  );

  const isSetByEnv = !!settingDetails?.is_env_setting;

  return (
    <SettingsSection
      title={t`Workspaces`}
      titleProps={{ order: 2 }}
      description={
        isSetByEnv ? t`Using ${settingDetails?.env_name}` : undefined
      }
    >
      <Switch
        checked={!!value}
        disabled={isSetByEnv || isLoading}
        label={t`Write transform output to a workspace schema`}
        description={t`Transform runs write their output tables into each database's workspace schema instead of the target the transform names, so a run can be reviewed before it replaces what people read. Set the schema per database.`}
        onChange={(event) =>
          updateSetting({
            key: WORKSPACES_ENABLED_SETTING,
            value: event.currentTarget.checked,
          })
        }
      />
    </SettingsSection>
  );
};
