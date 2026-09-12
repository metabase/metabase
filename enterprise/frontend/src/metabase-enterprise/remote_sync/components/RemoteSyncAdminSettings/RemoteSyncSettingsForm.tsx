import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
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
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";
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
  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const { initialValues, libraryCollection } =
    useRemoteSyncInitialValues(variant);
  const {
    handleSubmit,
    branchChangeModal,
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
              <Stack gap="xxl" maw="52rem">
                {!isModalVariant && !isRemoteSyncEnabled && <SetupGuideLink />}

                <GitSettingsSection />
                <SyncModeSection dirty={dirtyEntities} />

                {isRemoteSyncEnabled && isReadWrite && !isModalVariant && (
                  <BranchSwitcherSection dirty={dirtyEntities} />
                )}
                {isReadOnly && <ReadOnlyBranchSection />}
                {(isRemoteSyncEnabled || isReadWrite) && !isModalVariant && (
                  <CollectionsToSyncSection />
                )}
                {isModalVariant && isReadWrite && (
                  <RemoteSyncSettingsSection title={t`Content to sync`}>
                    <TopLevelCollectionsList skipCollections />
                  </RemoteSyncSettingsSection>
                )}

                <Flex justify="space-between" align="center">
                  <Box>
                    {canDisable && (
                      <Button
                        c="feedback-negative"
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

                  <Flex align="center" gap="lg">
                    <FormErrorMessage />
                    {onCancel && (
                      <Button
                        variant="default"
                        onClick={onCancel}
                        disabled={isSaving}
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
                          : t`Set up remote sync`
                      }
                      variant="filled"
                      disabled={
                        isRemoteSyncEnabled ? !dirty : !values?.[URL_KEY]
                      }
                      loading={isSaving || isCreatingLibrary}
                    />
                  </Flex>
                </Flex>
              </Stack>

              {/* Inside the form so its fix-and-save can write through formik; Mantine portals it out. */}
              {!isModalVariant && (
                <RemoteSyncDependencyModal required={requiredSyncs} />
              )}
            </Form>
          );
        }}
      </FormProvider>

      {branchChangeModal}
      {disableModal}

      <RemoteSyncConflictModal />
    </RemoteSyncSettingsVariantProvider>
  );
};

const SetupGuideLink = () => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  return (
    <Text c="text-secondary" size="sm">
      {jt`Need help setting this up? Check out our ${(
        <ExternalLink key="link" href={docsUrl}>
          {t`setup guide`}
        </ExternalLink>
      )}.`}
    </Text>
  );
};
