import { type ComponentProps, useCallback, useMemo, useRef } from "react";
import { jt, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
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
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
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
  useCreateLibraryMutation,
  useGetLibraryCollectionQuery,
} from "metabase-enterprise/api";
import {
  useGetRemoteSyncChangesQuery,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api/remote-sync";
import { useGitSyncVisible } from "metabase-enterprise/remote_sync/hooks/use-git-sync-visible";
import { getSyncConflictVariant } from "metabase-enterprise/remote_sync/selectors";
import { syncConflictVariantUpdated } from "metabase-enterprise/remote_sync/sync-task-slice";
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
  SYNC_LIBRARY_PENDING_KEY,
  TOKEN_KEY,
  TRANSFORMS_KEY,
  TYPE_KEY,
  URL_KEY,
} from "../../constants";
import { SharedTenantCollectionsList } from "../SharedTenantCollectionsList";
import { SyncConflictModal } from "../SyncConflictModal";
import { TopLevelCollectionsList } from "../TopLevelCollectionsList";

import { PullChangesButton } from "./PullChangesButton";

export type RemoteSyncSettingsFormProps = {
  onCancel?: VoidFunction;
  onSaveSuccess?: VoidFunction;
  variant?: "admin" | "settings-modal";
};

type RemoteSyncSettingsFormState = RemoteSyncConfigurationSettings & {
  [SYNC_LIBRARY_PENDING_KEY]?: boolean;
};

export const RemoteSyncSettingsForm = (props: RemoteSyncSettingsFormProps) => {
  const { onCancel, onSaveSuccess, variant = "admin" } = props;
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [
    updateRemoteSyncSettings,
    { isLoading: isUpdatingRemoteSyncSettings },
  ] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary, { isLoading: isCreatingLibrary }] =
    useCreateLibraryMutation();
  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const pendingConfirmationSettingsRef =
    useRef<RemoteSyncConfigurationSettings | null>(null);

  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const useTenants = useSetting("use-tenants");
  const applicationName = useSelector(getApplicationName);

  // Fetch top-level collections to build initial sync state
  const { data: topLevelCollectionsData } = useListCollectionItemsQuery(
    { id: "root", models: ["collection"] },
    { skip: !isRemoteSyncEnabled },
  );

  const isModalVariant = variant === "settings-modal";

  // Fetch library collection to build initial sync state
  // For modal variant, always fetch to enable default-checked toggles
  const { data: libraryCollectionData } = useGetLibraryCollectionQuery(
    undefined,
    { skip: !isRemoteSyncEnabled && !isModalVariant },
  );
  // Library collection endpoint returns { data: null } when not found
  const libraryCollection =
    libraryCollectionData && "name" in libraryCollectionData
      ? libraryCollectionData
      : undefined;
  const dispatch = useDispatch();
  const conflictVariant = useSelector(getSyncConflictVariant);
  const { currentBranch } = useGitSyncVisible();

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
    async (values: RemoteSyncSettingsFormState) => {
      const didBranchChange =
        values[BRANCH_KEY] !== settingValues?.[BRANCH_KEY];

      const collectionsMap: Record<number, boolean> = {
        ...values[COLLECTIONS_KEY],
      };

      // If user wants to sync library but it doesn't exist yet, create it first
      const wantsSyncLibrary = values[SYNC_LIBRARY_PENDING_KEY];
      if (isModalVariant && !libraryCollection && wantsSyncLibrary) {
        try {
          const newLibrary = await createLibrary().unwrap();
          // Cast to number since the newly created library will have a numeric ID
          collectionsMap[newLibrary.id as number] = true;
        } catch (error) {
          sendToast({
            message: t`Failed to create Library`,
            icon: "warning",
          });
          throw error;
        }
      }

      // Don't send collections when in read-only mode
      // Also filter out the sync-library-pending key as it's not a real setting
      const isReadOnly = values[TYPE_KEY] === "read-only";
      const settingsToSave: RemoteSyncConfigurationSettings = {
        [REMOTE_SYNC_KEY]: values[REMOTE_SYNC_KEY],
        [URL_KEY]: values[URL_KEY],
        [TOKEN_KEY]: values[TOKEN_KEY],
        [TYPE_KEY]: values[TYPE_KEY],
        [BRANCH_KEY]: values[BRANCH_KEY],
        [AUTO_IMPORT_KEY]: values[AUTO_IMPORT_KEY],
        [TRANSFORMS_KEY]: values[TRANSFORMS_KEY],
        ...(isReadOnly
          ? {}
          : {
              [COLLECTIONS_KEY]: collectionsMap,
            }),
      };

      const saveSettings = async (
        settings: RemoteSyncConfigurationSettings,
      ) => {
        try {
          await updateRemoteSyncSettings(settings).unwrap();

          trackRemoteSyncSettingsChanged({
            triggeredFrom: isModalVariant ? "data-studio" : "admin-settings",
          });

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
          onSaveSuccess?.();
        } catch (error) {
          sendToast({
            message: getErrorMessage(error, t`Settings could not be saved`),
            icon: "warning",
          });
          throw error;
        }
      };

      if (didBranchChange) {
        pendingConfirmationSettingsRef.current = settingsToSave;
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
      await saveSettings(settingsToSave);
    },
    [
      settingValues,
      updateRemoteSyncSettings,
      isModalVariant,
      libraryCollection,
      createLibrary,
      sendToast,
      onSaveSuccess,
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

    // For modal variant during first-time setup, default library to checked
    const shouldDefaultToChecked = isModalVariant && !isRemoteSyncEnabled;

    // Add library collection
    if (libraryCollection) {
      collectionSyncMap[libraryCollection.id] = shouldDefaultToChecked
        ? true
        : (libraryCollection.is_remote_synced ?? false);
    }

    // Add top-level collections (excluding personal)
    topLevelCollectionsData?.data
      ?.filter((c) => !c.personal_owner_id)
      .forEach((collection) => {
        collectionSyncMap[collection.id] = collection.is_remote_synced ?? false;
      });

    // Add tenant collections
    tenantCollectionsData?.data?.forEach((collection) => {
      collectionSyncMap[collection.id] = collection.is_remote_synced ?? false;
    });

    return {
      ...values,
      [TOKEN_KEY]: tokenValue,
      [COLLECTIONS_KEY]: collectionSyncMap,
      // For modal variant during first-time setup, default transforms to checked (if enabled)
      [TRANSFORMS_KEY]:
        shouldDefaultToChecked && PLUGIN_TRANSFORMS.isEnabled
          ? true
          : values[TRANSFORMS_KEY],
      // For modal variant when library doesn't exist, default to wanting to create and sync it
      [SYNC_LIBRARY_PENDING_KEY]: shouldDefaultToChecked && !libraryCollection,
    };
  }, [
    settingValues,
    settingDetails,
    libraryCollection,
    topLevelCollectionsData,
    tenantCollectionsData,
    isModalVariant,
    isRemoteSyncEnabled,
  ]);

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  const hasUnsyncedChanges = !!dirtyData?.dirty?.length && isRemoteSyncEnabled;

  return (
    <>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={REMOTE_SYNC_SCHEMA}
        validationContext={settingValues}
        onSubmit={handleSubmit}
      >
        {({ dirty, values }) => (
          <Form disabled={!dirty}>
            <Stack gap="xl" maw="52rem">
              {!isModalVariant && !isRemoteSyncEnabled && (
                <Text c="text-secondary" size="sm">
                  {jt`Need help setting this up? Check out our ${(
                    <ExternalLink key="link" href={docsUrl}>
                      {t`setup guide`}
                    </ExternalLink>
                  )}.`}
                </Text>
              )}

              {/* Section 1: Git settings */}
              <RemoteSyncSettingsSection
                title={t`Git settings`}
                variant={variant}
              >
                <FormTextInput
                  name={URL_KEY}
                  label={t`Repository URL`}
                  placeholder="https://git-host.example.com/yourcompany/repo.git"
                  labelProps={{ mb: "0.75rem" }}
                  {...getEnvSettingProps(settingDetails?.[URL_KEY])}
                />
                <FormTextInput
                  name={TOKEN_KEY}
                  label={t`Access Token`}
                  description={
                    <Text c="text-tertiary" size="sm" lh="md" component="span">
                      {t`Personal access token with write permissions`}
                    </Text>
                  }
                  type="password"
                  {...getEnvSettingProps(settingDetails?.[TOKEN_KEY])}
                />
              </RemoteSyncSettingsSection>

              {/* Section 2: Sync mode for this instance */}
              <RemoteSyncSettingsSection
                title={t`Sync mode for this instance`}
                variant={variant}
              >
                <FormRadioGroup name={TYPE_KEY}>
                  <Stack>
                    <Tooltip
                      disabled={!hasUnsyncedChanges}
                      label={t`You can't switch to Read-only as you have unpublished changes.`}
                      position="bottom-start"
                    >
                      <Box>
                        <Radio
                          description={
                            <Text
                              c="text-secondary"
                              lh="1.25rem"
                              component="span"
                            >
                              {t`Usually you should use this for your production ${applicationName} instance. All synced collections are read-only, and will automatically sync with the specified branch (we'd recommend syncing with main).`}
                            </Text>
                          }
                          disabled={hasUnsyncedChanges}
                          label={
                            <Text fw={700} lh="1.25rem" mb="xs">
                              {t`Read-only`}
                            </Text>
                          }
                          value="read-only"
                        />
                      </Box>
                    </Tooltip>
                    <Radio
                      value="read-write"
                      label={
                        <Text fw={700} lh="1.25rem" mb="xs">
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
              </RemoteSyncSettingsSection>

              {/* Section 3: Branch to sync with (read-only only) */}
              {values?.[TYPE_KEY] === "read-only" && (
                <RemoteSyncSettingsSection
                  title={t`Branch to sync with`}
                  variant={variant}
                >
                  <Flex align="flex-end" gap="md">
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
                      mb="0.6125rem"
                      name={AUTO_IMPORT_KEY}
                      size="sm"
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
                </RemoteSyncSettingsSection>
              )}

              {/* Section 4: Collections to sync */}
              {(isRemoteSyncEnabled || values?.[TYPE_KEY] === "read-write") &&
                !isModalVariant && (
                  <RemoteSyncSettingsSection
                    description={t`Choose which collections to sync with git.`}
                    title={t`Collections to sync`}
                    variant={variant}
                  >
                    <Stack gap="lg">
                      <TopLevelCollectionsList />
                      {useTenants && (
                        <>
                          <Text fw={700} size="md" lh="1rem">
                            {t`Shared collections`}
                          </Text>
                          <SharedTenantCollectionsList />
                        </>
                      )}
                    </Stack>
                  </RemoteSyncSettingsSection>
                )}

              {/* Content to sync section for modal variant */}
              {isModalVariant && values?.[TYPE_KEY] === "read-write" && (
                <RemoteSyncSettingsSection
                  title={t`Content to sync`}
                  variant={variant}
                >
                  <TopLevelCollectionsList skipCollections />
                </RemoteSyncSettingsSection>
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
                  {onCancel && (
                    <Button
                      variant="default"
                      onClick={onCancel}
                      disabled={isUpdatingRemoteSyncSettings}
                    >
                      {t`Cancel`}
                    </Button>
                  )}
                  <FormSubmitButton
                    data-testid="remote-sync-submit-button"
                    size="md"
                    label={
                      isRemoteSyncEnabled
                        ? t`Save changes`
                        : t`Set up Remote Sync`
                    }
                    variant="filled"
                    disabled={isRemoteSyncEnabled ? !dirty : !values?.[URL_KEY]}
                    loading={isUpdatingRemoteSyncSettings || isCreatingLibrary}
                  />
                </Flex>
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>

      {changeBranchConfirmationModal}
      {disableConfirmationModal}

      {!!conflictVariant && !!currentBranch && (
        <SyncConflictModal
          currentBranch={currentBranch}
          onClose={() => {
            dispatch(syncConflictVariantUpdated(null));
          }}
          variant={conflictVariant}
        />
      )}
    </>
  );
};

const RemoteSyncSettingsSection = ({
  children,
  title,
  variant,
  ...props
}: ComponentProps<typeof SettingsSection> & {
  title: string;
  variant: RemoteSyncSettingsFormProps["variant"];
}) => {
  return (
    <SettingsSection
      {...props}
      title={title}
      titleProps={{
        order: variant === "settings-modal" ? 3 : 2,
      }}
    >
      {children}
    </SettingsSection>
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
