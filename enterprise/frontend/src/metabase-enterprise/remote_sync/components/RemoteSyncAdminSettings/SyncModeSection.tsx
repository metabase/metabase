import { useFormikContext } from "formik";
import { t } from "ttag";

import { FormRadioGroup } from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import { Box, Radio, Stack, Text, Tooltip } from "metabase/ui";
import type { CollectionId, RemoteSyncEntity } from "metabase-types/api";

import {
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  SYNC_LIBRARY_PENDING_KEY,
  TRANSFORMS_KEY,
  TYPE_KEY,
} from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";

import { DevInstanceUpsell } from "./DevInstanceUpsell";
import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

type SyncModeSectionProps = {
  dirty: RemoteSyncEntity[];
  libraryCollectionId?: CollectionId;
};

export const SyncModeSection = ({
  dirty,
  libraryCollectionId,
}: SyncModeSectionProps) => {
  const { initialValues, setFieldValue } =
    useFormikContext<RemoteSyncSettingsFormState>();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const applicationName = useSelector(getApplicationName);
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const isDevInstance = useSetting("development-mode?");

  const typeDetails = settingDetails?.[TYPE_KEY];
  const isSetByEnv = !!typeDetails?.is_env_setting;
  const hasUnsyncedChanges = dirty.length > 0 && isRemoteSyncEnabled;

  const handleTypeChange = (type: string) => {
    if (type === "read-write") {
      setFieldValue(TRANSFORMS_KEY, true);
      setFieldValue(SYNC_LIBRARY_PENDING_KEY, true);
      if (libraryCollectionId != null) {
        setFieldValue(`${COLLECTIONS_KEY}.${libraryCollectionId}`, true);
      }
    } else {
      setFieldValue(COLLECTIONS_KEY, initialValues[COLLECTIONS_KEY] ?? {});
      setFieldValue(TRANSFORMS_KEY, initialValues[TRANSFORMS_KEY]);
      setFieldValue(
        SYNC_LIBRARY_PENDING_KEY,
        initialValues[SYNC_LIBRARY_PENDING_KEY],
      );
    }
  };

  return (
    <RemoteSyncSettingsSection
      title={t`Sync mode for this instance`}
      description={isSetByEnv ? t`Using ${typeDetails.env_name}` : undefined}
    >
      <FormRadioGroup name={TYPE_KEY} onChange={handleTypeChange}>
        <Stack>
          <Tooltip
            disabled={!hasUnsyncedChanges}
            label={t`You can't switch to Read-only as you have unpublished changes.`}
            position="bottom-start"
          >
            <Box>
              <Radio
                description={
                  <Text c="text-secondary" lh="1.25rem" component="span">
                    {t`Usually you should use this for your production ${applicationName} instance. All synced collections are read-only, and will automatically sync with the specified branch (we'd recommend syncing with main).`}
                  </Text>
                }
                disabled={hasUnsyncedChanges || isSetByEnv}
                label={
                  <Text fw={700} lh="1.25rem" mb="xxs">
                    {t`Read-only`}
                  </Text>
                }
                value="read-only"
              />
            </Box>
          </Tooltip>
          <Radio
            value="read-write"
            disabled={isSetByEnv}
            label={
              <Text fw={700} lh="1.25rem" mb="xxs">
                {t`Read-write`}
              </Text>
            }
            description={
              <Text c="text-secondary" lh="1.25rem" component="span">
                {t`This mode is generally for development or local instances of ${applicationName}. Changes you make to content in synced collections can be pushed and pulled from any git branch.`}
              </Text>
            }
          />
        </Stack>
      </FormRadioGroup>
      {!isDevInstance && (
        <DevInstanceUpsell campaign="remote-sync-dev-instance" dismissible />
      )}
    </RemoteSyncSettingsSection>
  );
};
