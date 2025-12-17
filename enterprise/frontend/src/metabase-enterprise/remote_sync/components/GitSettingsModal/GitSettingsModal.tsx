import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Flex,
  Modal,
  Radio,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import {
  useGetRemoteSyncChangesQuery,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api/remote-sync";
import type {
  RemoteSyncConfigurationSettings,
  SettingDefinition,
} from "metabase-types/api";

import {
  AUTO_IMPORT_KEY,
  BRANCH_KEY,
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  TOKEN_KEY,
  TYPE_KEY,
  URL_KEY,
} from "../../constants";

export interface GitSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitSettingsModal = ({
  isOpen,
  onClose,
}: GitSettingsModalProps) => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateRemoteSyncSettings] = useUpdateRemoteSyncSettingsMutation();
  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });

  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const applicationName = useSelector(getApplicationName);
  const [sendToast] = useToast();

  // Fetch library collection to get its ID for read-write mode
  const { data: libraryCollectionData } = useGetLibraryCollectionQuery();
  const libraryCollection =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;

  const handleSubmit = useCallback(
    async (values: RemoteSyncConfigurationSettings) => {
      let settingsToSave = { ...values };

      if (values[TYPE_KEY] === "read-write" && libraryCollection) {
        // In read-write mode, automatically enable library collection for sync
        settingsToSave = {
          ...settingsToSave,
          [COLLECTIONS_KEY]: { [libraryCollection.id]: true },
        };
      } else {
        // In read-only mode, don't include collections
        const { [COLLECTIONS_KEY]: _collections, ...rest } = settingsToSave;
        settingsToSave = rest as RemoteSyncConfigurationSettings;
      }

      try {
        await updateRemoteSyncSettings(settingsToSave).unwrap();
        sendToast({ message: t`Settings saved successfully`, icon: "check" });
        onClose();
      } catch (error) {
        sendToast({
          message: t`Settings could not be saved`,
          icon: "warning",
        });
        throw error;
      }
    },
    [libraryCollection, updateRemoteSyncSettings, sendToast, onClose],
  );

  const initialValues = useMemo(() => {
    const values = REMOTE_SYNC_SCHEMA.cast(settingValues, {
      stripUnknown: true,
    });
    const tokenValue =
      settingDetails?.[TOKEN_KEY]?.value ?? settingValues?.[TOKEN_KEY];

    return {
      ...values,
      [TOKEN_KEY]: tokenValue,
    };
  }, [settingValues, settingDetails]);

  const hasUnsyncedChanges = !!dirtyData?.dirty?.length;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      withCloseButton={false}
      title={
        <Stack gap="xs" mb="2rem">
          <Text
            fw={700}
            size="lg"
          >{t`Set up remote sync for your Library`}</Text>
          <Text
            c="text-medium"
            size="sm"
            fw={400}
          >{t`Keep your Library and transforms safely backed up in git.`}</Text>
        </Stack>
      }
      size="lg"
      padding="xl"
    >
      <FormProvider
        initialValues={initialValues as RemoteSyncConfigurationSettings}
        enableReinitialize
        validationSchema={REMOTE_SYNC_SCHEMA}
        validationContext={settingValues}
        onSubmit={handleSubmit}
      >
        {({ dirty, values }) => (
          <Form disabled={!dirty}>
            <Stack gap="xl">
              {/* Git repository section */}
              <SettingsSection title={t`Git repository`}>
                <FormTextInput
                  name={URL_KEY}
                  label={t`Repository URL`}
                  placeholder="https://github.com/yourcompany/metabase-library.git"
                  {...getEnvSettingProps(settingDetails?.[URL_KEY])}
                />
                <FormTextInput
                  name={TOKEN_KEY}
                  label={t`Access token`}
                  description={t`Personal access token with write permissions`}
                  type="password"
                  {...getEnvSettingProps(settingDetails?.[TOKEN_KEY])}
                />
              </SettingsSection>

              {/* Sync mode section */}
              <SettingsSection title={t`Sync mode for this instance`}>
                <FormRadioGroup name={TYPE_KEY}>
                  <Stack mt="sm">
                    <Tooltip
                      disabled={!hasUnsyncedChanges}
                      label={t`You can't switch to Read-only as you have unpublished changes.`}
                      position="bottom-start"
                    >
                      <Box>
                        <Radio
                          description={t`Usually you should use this for your production ${applicationName} instance. All synced collections are read-only, and will automatically sync with the specified branch (we'd recommend syncing with main).`}
                          disabled={hasUnsyncedChanges}
                          label={t`Read-only`}
                          value="read-only"
                        />
                      </Box>
                    </Tooltip>
                    <Radio
                      value="read-write"
                      label={t`Read-write`}
                      description={t`This mode is generally for development or local instances of ${applicationName}. Changes you make to content in synced collections can be pushed and pulled from any git branch.`}
                    />
                  </Stack>
                </FormRadioGroup>
              </SettingsSection>

              {/* Branch section (read-only mode only) */}
              {values?.[TYPE_KEY] === "read-only" && (
                <SettingsSection title={t`Branch to sync with`}>
                  <Flex align="flex-end" gap="md">
                    <Box style={{ flex: 1 }}>
                      <FormTextInput
                        name={BRANCH_KEY}
                        placeholder="main"
                        label={t`Sync branch`}
                        {...getEnvSettingProps(settingDetails?.[BRANCH_KEY])}
                      />
                    </Box>
                    {/* centers the switch vs the input box, otherwise it is centered against the label + input
                        this feels bad. */}
                    <Box pb="0.6rem">
                      <FormSwitch
                        size="sm"
                        name={AUTO_IMPORT_KEY}
                        label={t`Auto-sync with git`}
                      />
                    </Box>
                  </Flex>
                </SettingsSection>
              )}

              {/* Read-write mode info */}
              {values?.[TYPE_KEY] === "read-write" && (
                <Text c="text-medium" size="sm">
                  {t`In read-write mode, the Library collection will be enabled for syncing.`}
                </Text>
              )}

              {/* Footer */}
              <Flex justify="flex-end" gap="md">
                <FormErrorMessage />
                <Button variant="subtle" onClick={onClose}>
                  {t`Cancel`}
                </Button>
                <FormSubmitButton
                  variant="filled"
                  label={t`Save changes`}
                  disabled={isRemoteSyncEnabled ? !dirty : !values?.[URL_KEY]}
                />
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};

const getEnvSettingProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
    };
  }
  return {};
};
