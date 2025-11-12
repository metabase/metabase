import { useCallback, useMemo, useRef } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting, useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import {
  Badge,
  Box,
  Button,
  Flex,
  Radio,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import {
  useGetRemoteSyncChangesQuery,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api/remote-sync";
import type {
  RemoteSyncConfigurationSettings,
  SettingDefinition,
} from "metabase-types/api";

import {
  trackBranchSwitched,
  trackRemoteSyncDeactivated,
  trackRemoteSyncSettingsChanged,
} from "../../analytics";
import {
  AUTO_IMPORT_KEY,
  BRANCH_KEY,
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  TOKEN_KEY,
  TYPE_KEY,
  URL_KEY,
} from "../../constants";

import { PullChangesButton } from "./PullChangesButton";

export const RemoteSyncAdminSettings = () => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateRemoteSyncSettings] = useUpdateRemoteSyncSettingsMutation();
  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const pendingConfirmationSettingsRef =
    useRef<RemoteSyncConfigurationSettings | null>(null);

  const {
    show: showChangeBranchConfirmation,
    modalContent: changeBranchConfirmationModal,
  } = useConfirmation();
  const [sendToast] = useToast();

  const {
    show: showDisableConfirmation,
    modalContent: disableConfirmationModal,
  } = useConfirmation();

  const handleSubmit = useCallback(
    async (values: RemoteSyncConfigurationSettings) => {
      const didBranchChange =
        values[BRANCH_KEY] !== settingValues?.[BRANCH_KEY];
      const saveSettings = async (values: RemoteSyncConfigurationSettings) => {
        try {
          await updateRemoteSyncSettings(values).unwrap();

          trackRemoteSyncSettingsChanged();

          if (
            didBranchChange &&
            settingValues?.[BRANCH_KEY] &&
            values[BRANCH_KEY]
          ) {
            trackBranchSwitched({
              triggeredFrom: "admin-settings",
            });
          }

          sendToast({ message: t`Settings saved successfully`, icon: "check" });
        } catch (error) {
          sendToast({
            message: t`Settings could not be saved`,
            icon: "warning",
          });
          throw error;
        }
      };

      if (didBranchChange) {
        pendingConfirmationSettingsRef.current = values;
        showChangeBranchConfirmation({
          title: t`Switch branches?`,
          message: t`The synced collection will update to match the new branch. Questions that exist in the current branch but not the new one will be removed from any dashboards or content that reference them permanently, even if you switch back.`,
          confirmButtonText: t`Continue`,
          confirmButtonProps: {
            variant: "filled",
            color: "danger",
          },
          onConfirm: async () => {
            if (pendingConfirmationSettingsRef.current) {
              await saveSettings(pendingConfirmationSettingsRef.current);
              pendingConfirmationSettingsRef.current = null;
            }
          },
          onCancel: () => {
            pendingConfirmationSettingsRef.current = null;
          },
        });
        return;
      }
      await saveSettings(values);
    },
    [
      settingValues,
      updateRemoteSyncSettings,
      sendToast,
      showChangeBranchConfirmation,
    ],
  );

  const handleDisable = useCallback(async () => {
    showDisableConfirmation({
      title: t`Disable Remote Sync?`,
      message: t`This will clear all remote sync settings. Any changes made to the Library collection after disabling can be overwritten if you enable sync again.`,
      confirmButtonText: t`Disable`,
      confirmButtonProps: {
        variant: "filled",
        color: "danger",
      },
      onConfirm: async () => {
        try {
          await updateRemoteSyncSettings({ [URL_KEY]: "" }).unwrap();
          trackRemoteSyncDeactivated();
          sendToast({ message: t`Remote Sync disabled`, icon: "check" });
        } catch (error) {
          console.error(error);
          sendToast({
            message: t`Failed to disable Remote Sync`,
            icon: "warning",
          });
        }
      },
    });
  }, [updateRemoteSyncSettings, sendToast, showDisableConfirmation]);

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

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const hasUnsyncedChanges = !!dirtyData?.dirty?.length;

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <Box flex={1} maw="52rem">
          <Flex align="flex-end" gap="sm" mb="xs">
            <Title order={2}>{t`Remote Sync`}</Title>
            {isRemoteSyncEnabled && (
              <Badge
                style={{ textTransform: "none" }}
                py={10}
                px="sm"
              >{t`Enabled`}</Badge>
            )}
          </Flex>
          <Text c="text-primary" size="sm" mb="md" maw="40rem" lh="1.5rem">
            {t`Keep your dashboards, questions, and collections safely backed up in Git.`}
          </Text>

          <FormProvider
            initialValues={initialValues as RemoteSyncConfigurationSettings}
            enableReinitialize
            validationSchema={REMOTE_SYNC_SCHEMA}
            validationContext={settingValues}
            onSubmit={handleSubmit}
          >
            {({ dirty, values }) => (
              <Form disabled={!dirty}>
                <Stack gap="md">
                  {!isRemoteSyncEnabled && (
                    <Text c="text-secondary" size="sm">
                      {jt`Need help setting this up? Check out our ${(
                        <ExternalLink key="link" href={docsUrl}>
                          {t`setup guide`}
                        </ExternalLink>
                      )}.`}
                    </Text>
                  )}

                  <FormTextInput
                    name={URL_KEY}
                    label={t`Repository URL`}
                    placeholder="https://github.com/yourcompany/metabase-library.git"
                    {...getEnvSettingProps(settingDetails?.[URL_KEY])}
                  />

                  <FormTextInput
                    name={TOKEN_KEY}
                    label={t`Access Token`}
                    description={t`Personal access token with write permissions`}
                    type="password"
                    {...getEnvSettingProps(settingDetails?.[TOKEN_KEY])}
                  />

                  <FormRadioGroup name={TYPE_KEY} label={t`Remote Sync Mode`}>
                    <Stack mt="sm">
                      <Radio
                        value="development"
                        label={t`Development`}
                        description={t`In development mode, you can make changes to synced collections and pull and push from any git branch`}
                      />
                      <Tooltip
                        disabled={!hasUnsyncedChanges}
                        label={t`You can't switch to production as you have unpublished changes.`}
                        position="bottom-start"
                      >
                        <Box>
                          <Radio
                            description={t`In production mode, synced collections are read-only, and automatically sync with the specified branch`}
                            disabled={hasUnsyncedChanges}
                            label={t`Production`}
                            value="production"
                          />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </FormRadioGroup>

                  {values?.[TYPE_KEY] === "production" && (
                    <Stack ml="1.875rem">
                      <Flex align="end" gap="md">
                        <Box style={{ flex: 1 }}>
                          <FormTextInput
                            name={BRANCH_KEY}
                            label={t`Sync branch`}
                            placeholder="main"
                            {...getEnvSettingProps(
                              settingDetails?.[BRANCH_KEY],
                            )}
                          />
                        </Box>
                        {isRemoteSyncEnabled && (
                          <PullChangesButton
                            branch={values?.[BRANCH_KEY] || "main"}
                            dirty={dirty}
                            forcePull
                          />
                        )}
                      </Flex>
                      <FormSwitch
                        size="sm"
                        name={AUTO_IMPORT_KEY}
                        label={t`Auto-sync with git`}
                      />
                    </Stack>
                  )}

                  <Flex justify="end" align="center" gap="md">
                    <FormErrorMessage />
                    {isRemoteSyncEnabled && (
                      <Button onClick={handleDisable}>
                        {t`Disable Remote Sync`}
                      </Button>
                    )}
                    <FormSubmitButton
                      label={
                        isRemoteSyncEnabled
                          ? t`Save changes`
                          : t`Set up Remote Sync`
                      }
                      variant="filled"
                      disabled={!dirty}
                      flex="auto 0 0"
                    />
                  </Flex>
                </Stack>
              </Form>
            )}
          </FormProvider>
        </Box>
      </SettingsSection>

      {changeBranchConfirmationModal}
      {disableConfirmationModal}
    </SettingsPageWrapper>
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
