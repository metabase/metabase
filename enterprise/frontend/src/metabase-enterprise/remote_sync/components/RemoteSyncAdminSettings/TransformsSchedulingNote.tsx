import { t } from "ttag";

import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import { Alert, Icon, Text } from "metabase/ui";

import { REMOTE_SYNC_KEY, TRANSFORMS_KEY, TYPE_KEY } from "../../constants";

const SCHEDULING_KEY = "transforms-scheduling-enabled";

type TransformsSchedulingNoteProps = {
  isReadWrite: boolean;
  isTransformsSyncEnabled: boolean;
};

/**
 * The API does not tell a stored `transforms-scheduling-enabled` from its
 * derived default. Scheduling that is on for a saved read-write config with
 * transforms sync is therefore an admin override.
 */
export const TransformsSchedulingNote = ({
  isReadWrite,
  isTransformsSyncEnabled,
}: TransformsSchedulingNoteProps) => {
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const isSchedulingEnabled = useSetting(SCHEDULING_KEY);
  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const savedType = useSetting(TYPE_KEY);
  const isSavedTransformsSync = useSetting(TRANSFORMS_KEY);

  const isSetByEnv = !!settingDetails?.[SCHEDULING_KEY]?.is_env_setting;
  const isOverridden =
    !!isRemoteSyncEnabled &&
    savedType === "read-write" &&
    !!isSavedTransformsSync &&
    isSchedulingEnabled;

  if (
    !PLUGIN_TRANSFORMS.isEnabled ||
    !isReadWrite ||
    !isTransformsSyncEnabled ||
    isSetByEnv ||
    isOverridden
  ) {
    return null;
  }

  return (
    <Alert
      color="warning"
      icon={<Icon name="warning" />}
      data-testid="remote-sync-transforms-scheduling-note"
    >
      <Text lh="inherit">
        {t`When this instance syncs transforms in read-write mode, scheduled job runs are paused, because another instance that reads the same repository is expected to run them. Manual runs still work. To run jobs on schedule here, turn scheduling back on from the Jobs page after you save.`}
      </Text>
    </Alert>
  );
};
