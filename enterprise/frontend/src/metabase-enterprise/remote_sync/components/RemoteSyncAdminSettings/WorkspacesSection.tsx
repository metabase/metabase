import { t } from "ttag";

import { useAdminSetting } from "metabase/settings";
import { Switch } from "metabase/ui";

import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

const WORKSPACES_KEY = "workspaces-enabled";

/**
 * Saves on toggle rather than with the surrounding form. The form posts one closed payload to
 * `PUT /api/ee/remote-sync/settings`, which takes remote-sync settings only; this is a workspaces setting, so it
 * goes through the generic setting API instead.
 */
export const WorkspacesSection = () => {
  const { value, updateSetting, settingDetails, isLoading } =
    useAdminSetting(WORKSPACES_KEY);

  const isSetByEnv = !!settingDetails?.is_env_setting;

  return (
    <RemoteSyncSettingsSection
      title={t`Workspaces`}
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
            key: WORKSPACES_KEY,
            value: event.currentTarget.checked,
          })
        }
      />
    </RemoteSyncSettingsSection>
  );
};
