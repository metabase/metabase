import { useFormikContext } from "formik";
import { t } from "ttag";

import { FormSwitch, FormTextInput } from "metabase/forms";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import { Box, Stack } from "metabase/ui";

import { AUTO_IMPORT_KEY, BRANCH_KEY, REMOTE_SYNC_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import { getEnvSettingProps } from "../../utils";

import { PullChangesButton } from "./PullChangesButton";
import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

export const ReadOnlyBranchSection = () => {
  const { dirty, values } = useFormikContext<RemoteSyncSettingsFormState>();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);

  return (
    <RemoteSyncSettingsSection title={t`Branch to sync with`}>
      <Stack gap="lg">
        <Box style={{ flex: 1 }}>
          <FormTextInput
            name={BRANCH_KEY}
            placeholder="main"
            label={t`Sync branch`}
            labelProps={{ mb: "0.75rem" }}
            {...getEnvSettingProps(settingDetails?.[BRANCH_KEY])}
          />
        </Box>
        <FormSwitch
          label={t`Auto-sync with git`}
          description={t`Periodically import changes from the sync branch. When auto-sync is off, you'll need to pull changes from the sync branch manually.`}
          mb="0.6125rem"
          name={AUTO_IMPORT_KEY}
          size="sm"
          {...getEnvSettingProps(settingDetails?.[AUTO_IMPORT_KEY], {
            disabled: true,
          })}
        />
      </Stack>
      {isRemoteSyncEnabled && (
        <Box>
          <PullChangesButton
            branch={values?.[BRANCH_KEY] || "main"}
            dirty={dirty}
            forcePull
          />
        </Box>
      )}
    </RemoteSyncSettingsSection>
  );
};
