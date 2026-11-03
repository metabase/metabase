import { t } from "ttag";

import { FormFooter } from "metabase/common/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useSetting,
} from "metabase/settings";
import { CollapsibleSettingsSection } from "metabase/settings-components";
import { Button, Icon, Stack, useIsInModal } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import {
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  TYPE_KEY,
  URL_KEY,
} from "../../constants";
import { useDisableRemoteSync } from "../../hooks/use-disable-remote-sync";
import { useRemoteSyncInitialValues } from "../../hooks/use-remote-sync-initial-values";
import { useRemoteSyncSubmit } from "../../hooks/use-remote-sync-submit";
import type { RemoteSyncSettingsVariant } from "../../types";
import { TopLevelCollectionsList } from "../TopLevelCollectionsList";

import { BranchSwitcherSection } from "./BranchSwitcherSection";
import { CollectionsToSyncSection } from "./CollectionsToSyncSection";
import { GitSettingsSection } from "./GitSettingsSection";
import { ReadOnlyBranchSection } from "./ReadOnlyBranchSection";
import { RemoteSyncConflictModal } from "./RemoteSyncConflictModal";
import { RemoteSyncDependencyModal } from "./RemoteSyncDependencyModal";
import {
  RemoteSyncNestedSectionProvider,
  RemoteSyncSettingsSection,
  RemoteSyncSettingsVariantProvider,
} from "./RemoteSyncSettingsSection";
import { SyncModeSection } from "./SyncModeSection";

export type RemoteSyncSettingsFormProps = {
  onCancel?: VoidFunction;
  onSaveSuccess?: VoidFunction;
  variant?: RemoteSyncSettingsVariant;
};

export const RemoteSyncSettingsForm = ({
  onCancel,
  onSaveSuccess,
  variant = "admin",
}: RemoteSyncSettingsFormProps) => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);
  const isCollectionsSyncEnabled = !!useSetting(
    "remote-sync-custom-collections-enabled",
  );
  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const { initialValues, libraryCollection } = useRemoteSyncInitialValues();
  const {
    handleSubmit,
    confirmationModal,
    isUpdating,
    isCreatingLibrary,
    unsyncedDependenciesError,
  } = useRemoteSyncSubmit({
    initialValues,
    libraryCollection,
    onSaveSuccess,
    variant,
  });
  const { handleDisable, disableModal, isDisabling } = useDisableRemoteSync();

  const dirtyEntities = dirtyData?.dirty ?? [];
  const requiredSyncs = unsyncedDependenciesError?.errors.required;
  const isModalVariant = variant === "settings-modal";
  const isInModal = useIsInModal();
  const isSaving = isUpdating || isDisabling;
  const canDisable =
    isRemoteSyncEnabled && !settingDetails?.[REMOTE_SYNC_KEY]?.is_env_setting;

  return (
    <RemoteSyncSettingsVariantProvider value={variant}>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        validationSchema={REMOTE_SYNC_SCHEMA}
        validationContext={settingValues}
        onSubmit={handleSubmit}
      >
        {({ dirty, values }) => {
          const isReadOnly = values?.[TYPE_KEY] === "read-only";
          const isReadWrite = values?.[TYPE_KEY] === "read-write";

          return (
            <Form disabled={!dirty}>
              <Stack gap={isInModal ? "xl" : "xxl"} maw="52rem">
                <GitSettingsSection />

                <CollapsibleSettingsSection
                  title={t`Advanced settings`}
                  description={
                    isRemoteSyncEnabled
                      ? t`Sync mode, branch, and content to sync.`
                      : t`By default, this instance is read-only and automatically syncs your Library and transforms from the main branch.`
                  }
                >
                  <RemoteSyncNestedSectionProvider value>
                    <Stack gap="xxl">
                      <SyncModeSection dirty={dirtyEntities} />

                      {isRemoteSyncEnabled &&
                        isReadWrite &&
                        !isModalVariant && (
                          <BranchSwitcherSection dirty={dirtyEntities} />
                        )}
                      {isReadOnly && <ReadOnlyBranchSection />}
                      {isCollectionsSyncEnabled &&
                        (isRemoteSyncEnabled || isReadWrite) &&
                        !isModalVariant && <CollectionsToSyncSection />}
                      {isModalVariant && isReadWrite && (
                        <RemoteSyncSettingsSection title={t`Content to sync`}>
                          <TopLevelCollectionsList skipCollections />
                        </RemoteSyncSettingsSection>
                      )}
                    </Stack>
                  </RemoteSyncNestedSectionProvider>
                </CollapsibleSettingsSection>
              </Stack>
              <FormFooter pageProps={{ gap: "lg", maw: "52rem", mt: "xxl" }}>
                {canDisable && (
                  <Button
                    color="negative"
                    variant="subtle"
                    leftSection={<Icon name="close" />}
                    mr="auto"
                    onClick={handleDisable}
                  >
                    {t`Disable remote sync`}
                  </Button>
                )}
                <FormErrorMessage />
                {onCancel && (
                  <Button onClick={onCancel} disabled={isSaving}>
                    {t`Cancel`}
                  </Button>
                )}
                <FormSubmitButton
                  data-testid="remote-sync-submit-button"
                  label={
                    isRemoteSyncEnabled
                      ? t`Save changes`
                      : t`Set up remote sync`
                  }
                  variant="filled"
                  disabled={isRemoteSyncEnabled ? !dirty : !values?.[URL_KEY]}
                  loading={isSaving || isCreatingLibrary}
                />
              </FormFooter>

              {/* Inside the form so its fix-and-save can write through formik; Mantine portals it out. */}
              {!isModalVariant && (
                <RemoteSyncDependencyModal required={requiredSyncs} />
              )}
            </Form>
          );
        }}
      </FormProvider>

      {confirmationModal}
      {disableModal}

      <RemoteSyncConflictModal />
    </RemoteSyncSettingsVariantProvider>
  );
};
