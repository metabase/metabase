import { useCallback, useMemo, useRef } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useListCollectionItemsQuery,
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
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Flex,
  Icon,
  Radio,
  Stack,
  Text,
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
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  TOKEN_KEY,
  TYPE_KEY,
  URL_KEY,
} from "../../constants";
import { SharedTenantCollectionsList } from "../SharedTenantCollectionsList";

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

  const isRemoteSyncEnabled = useSetting(REMOTE_SYNC_KEY);
  const useTenants = useSetting("use-tenants");
  const applicationName = useSelector(getApplicationName);

  // Fetch tenant collections to build initial sync state
  const { data: tenantCollectionsData } = useListCollectionItemsQuery(
    {
      id: "root",
      namespace: "shared-tenant-collection",
    },
    { skip: !isRemoteSyncEnabled || !useTenants },
  );

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

    // Build initial collection sync map from server data
    const collectionSyncMap: Record<number, boolean> = {};
    tenantCollectionsData?.data?.forEach((collection) => {
      collectionSyncMap[collection.id] = collection.is_remote_synced ?? false;
    });

    return {
      ...values,
      [TOKEN_KEY]: tokenValue,
      [COLLECTIONS_KEY]: collectionSyncMap,
    };
  }, [settingValues, settingDetails, tenantCollectionsData]);

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  const hasUnsyncedChanges = !!dirtyData?.dirty?.length;

  return (
    <SettingsPageWrapper
      title={t`Remote Sync`}
      description={t`Keep your dashboards, questions, and collections safely backed up in Git.`}
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
            <Stack gap="xl" maw="52rem">
              {!isRemoteSyncEnabled && (
                <Text c="text-secondary" size="sm">
                  {jt`Need help setting this up? Check out our ${(
                    <ExternalLink key="link" href={docsUrl}>
                      {t`setup guide`}
                    </ExternalLink>
                  )}.`}
                </Text>
              )}

              {/* Section 1: Git Settings */}
              <SettingsSection title={t`Git Settings`}>
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
              </SettingsSection>

              {/* Section 2: Sync Mode for this Instance */}
              <SettingsSection title={t`Sync Mode for this Instance`}>
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

              {/* Section 3: Branch to sync with (Read-only only) */}
              {values?.[TYPE_KEY] === "read-only" && (
                <SettingsSection title={t`Branch to sync with`}>
                  <Flex align="center" gap="md">
                    <Box style={{ flex: 1 }}>
                      <FormTextInput
                        name={BRANCH_KEY}
                        placeholder="main"
                        label={`Sync branch`}
                        {...getEnvSettingProps(settingDetails?.[BRANCH_KEY])}
                      />
                    </Box>
                    <FormSwitch
                      size="sm"
                      name={AUTO_IMPORT_KEY}
                      label={t`Auto-sync with git`}
                    />
                  </Flex>
                  {isRemoteSyncEnabled && (
                    <Box>
                      <PullChangesButton
                        branch={values?.[BRANCH_KEY] || "main"}
                        dirty={dirty}
                        forcePull
                      />
                    </Box>
                  )}
                </SettingsSection>
              )}

              {/* Section 4: Shared tenant collections to sync */}
              {isRemoteSyncEnabled && useTenants && (
                <SettingsSection
                  title={t`Shared tenant collections to sync`}
                  description={t`Choose which shared tenant collections to sync with git.`}
                >
                  <SharedTenantCollectionsList />
                </SettingsSection>
              )}

              {/* Footer Actions - Outside Sections */}
              <Flex justify="space-between" align="center">
                <Box>
                  {isRemoteSyncEnabled && (
                    <Button
                      c="error"
                      variant="subtle"
                      size="md"
                      w="12rem"
                      leftSection={<Icon name="close" />}
                      onClick={handleDisable}
                    >
                      {t`Disable remote sync`}
                    </Button>
                  )}
                </Box>
                <Flex align="center" gap="md">
                  <FormErrorMessage />
                  <FormSubmitButton
                    data-testid="remote-sync-submit-button"
                    size="md"
                    w="12rem"
                    label={
                      isRemoteSyncEnabled
                        ? t`Save changes`
                        : t`Set up Remote Sync`
                    }
                    variant="filled"
                    disabled={isRemoteSyncEnabled ? !dirty : !values?.[URL_KEY]}
                  />
                </Flex>
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>

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
