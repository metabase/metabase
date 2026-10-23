import { t } from "ttag";

import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useAdminSetting, useSetting } from "metabase/settings";
import { Alert, Box, Button, Icon, Stack, Text } from "metabase/ui";

/**
 * Shows that scheduled job runs are paused on this instance. Renders nothing
 * while `transforms-scheduling-enabled` is on. Admins can turn scheduling back
 * on, unless an environment variable sets the value.
 */
export const SchedulingPausedCallout = () => {
  const isSchedulingEnabled = useSetting("transforms-scheduling-enabled");
  const isAdmin = useSelector(getUserIsAdmin);

  if (isSchedulingEnabled !== false) {
    return null;
  }

  return (
    <Alert
      color="warning"
      icon={<Icon name="warning" />}
      data-testid="transforms-scheduling-paused-callout"
    >
      <Stack gap="sm">
        <Text lh="inherit">
          {t`Scheduled job runs are paused on this instance because it edits transforms that sync to Git. Another instance that reads the same repository is expected to run them. You can still run jobs and transforms manually.`}
        </Text>
        {isAdmin && <SchedulingOverride />}
      </Stack>
    </Alert>
  );
};

const SchedulingOverride = () => {
  const { settingDetails, updateSetting, updateSettingResult } =
    useAdminSetting("transforms-scheduling-enabled");

  if (settingDetails?.is_env_setting && settingDetails.env_name) {
    return (
      <Box mx="-sm">
        <SetByEnvVar varName={settingDetails.env_name} />
      </Box>
    );
  }

  return (
    <Box>
      <Button
        size="sm"
        loading={updateSettingResult.isLoading}
        onClick={() =>
          updateSetting({ key: "transforms-scheduling-enabled", value: true })
        }
      >{t`Turn scheduling back on`}</Button>
    </Box>
  );
};
