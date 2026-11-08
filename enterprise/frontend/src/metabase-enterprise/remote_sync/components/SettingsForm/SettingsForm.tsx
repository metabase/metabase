import { useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
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
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import { Button, Group, Loader, Radio, Stack } from "metabase/ui";
import {
  useCreateLibraryMutation,
  useGetRemoteSyncIsDirtyQuery,
  useTestRemoteSyncConnectionMutation,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";
import type {
  RegularCollectionId,
  RemoteSyncTaskId,
  RemoteSyncUnsyncedDependency,
} from "metabase-types/api";
import { isRemoteSyncUnsyncedDependenciesError } from "metabase-types/guards";

import {
  trackRemoteSyncDeactivated,
  trackRemoteSyncSettingsChanged,
} from "../../analytics";
import type { SettingsFormValues, SyncableCollection } from "../../types";
import { SyncTaskModal } from "../SyncTaskModal";

import { CollectionsField } from "./CollectionsField";
import { UnsyncedDependenciesModal } from "./UnsyncedDependenciesModal";
import {
  type SyncableCollections,
  useSettingsFormValues,
  useSyncableCollections,
} from "./hooks";

type SettingsFormProps = {
  triggeredFrom: "admin-settings" | "data-studio";
  onSaved?: () => void;
  onCancel?: () => void;
};

export const SettingsForm = (props: SettingsFormProps) => {
  const { isLoading: isLoadingSettings } = useGetAdminSettingsDetailsQuery();
  const syncableCollections = useSyncableCollections();

  if (isLoadingSettings || syncableCollections.isLoading) {
    return <Loader />;
  }

  return (
    <LoadedSettingsForm {...props} syncableCollections={syncableCollections} />
  );
};

type LoadedSettingsFormProps = {
  triggeredFrom: "admin-settings" | "data-studio";
  syncableCollections: SyncableCollections;
  onSaved?: () => void;
  onCancel?: () => void;
};

const LoadedSettingsForm = ({
  triggeredFrom,
  syncableCollections: { library, regularCollections, tenantCollections },
  onSaved,
  onCancel,
}: LoadedSettingsFormProps) => {
  const collections = useMemo(
    () => [...regularCollections, ...tenantCollections],
    [regularCollections, tenantCollections],
  );
  const initialValues = useSettingsFormValues(collections, library);
  const [updateSettings] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary] = useCreateLibraryMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [unsyncedDependencies, setUnsyncedDependencies] = useState<
    RemoteSyncUnsyncedDependency[] | null
  >(null);

  const getLibraryChange = async (
    isLibrarySynced: boolean,
  ): Promise<Record<RegularCollectionId, boolean>> => {
    if (library) {
      return isLibrarySynced !== library.isRemoteSynced
        ? { [library.id]: isLibrarySynced }
        : {};
    }
    if (!isLibrarySynced) {
      return {};
    }
    const created = await createLibrary().unwrap();
    return typeof created.id === "number" ? { [created.id]: true } : {};
  };
  const [sendToast] = useToast();

  const handleSubmit = async (values: SettingsFormValues) => {
    const changedCollections = Object.fromEntries(
      collections
        .filter(
          (collection) =>
            (values.collections[collection.id] ?? false) !==
            collection.isRemoteSynced,
        )
        .map((collection) => [
          collection.id,
          values.collections[collection.id] ?? false,
        ]),
    );
    const isReadWrite = values["remote-sync-type"] === "read-write";
    const libraryChange = isReadWrite
      ? await getLibraryChange(values.library)
      : {};
    setUnsyncedDependencies(null);
    const { task_id } = await updateSettings({
      "remote-sync-url": values["remote-sync-url"],
      "remote-sync-token": values["remote-sync-token"] || undefined,
      "remote-sync-type": values["remote-sync-type"],
      "remote-sync-branch": values["remote-sync-branch"] || null,
      "remote-sync-auto-import": values["remote-sync-auto-import"],
      collections: isReadWrite
        ? { ...changedCollections, ...libraryChange }
        : null,
    })
      .unwrap()
      .catch((error: unknown) => {
        if (isRemoteSyncUnsyncedDependenciesError(error)) {
          setUnsyncedDependencies(error.data.unsynced_dependencies);
        }
        throw error;
      });
    trackRemoteSyncSettingsChanged({ triggeredFrom });
    sendToast({ message: t`Remote sync settings saved`, icon: "check" });
    if (task_id != null) {
      setTaskId(task_id);
    } else {
      onSaved?.();
    }
  };

  const handleTaskModalClose = () => {
    setTaskId(null);
    onSaved?.();
  };

  return (
    <>
      <FormProvider
        initialValues={initialValues}
        enableReinitialize
        onSubmit={handleSubmit}
      >
        <>
          <SettingsFormBody
            regularCollections={regularCollections}
            tenantCollections={tenantCollections}
            onCancel={onCancel}
          />
          {unsyncedDependencies != null && (
            <UnsyncedDependenciesModal
              dependencies={unsyncedDependencies}
              onClose={() => setUnsyncedDependencies(null)}
            />
          )}
        </>
      </FormProvider>
      <SyncTaskModal
        title={t`Pulling changes`}
        taskId={taskId}
        onClose={handleTaskModalClose}
      />
    </>
  );
};

type SettingsFormBodyProps = {
  regularCollections: SyncableCollection[];
  tenantCollections: SyncableCollection[];
  onCancel?: () => void;
};

const SettingsFormBody = ({
  regularCollections,
  tenantCollections,
  onCancel,
}: SettingsFormBodyProps) => {
  const isTenantsEnabled = useSetting("use-tenants");
  const { values, dirty, setFieldValue } =
    useFormikContext<SettingsFormValues>();
  const isEnabled = useSetting("remote-sync-enabled");
  const savedType = useSetting("remote-sync-type");
  const isReadWrite = values["remote-sync-type"] === "read-write";
  const isBranchInAppBar = isEnabled === true && isReadWrite;
  const isDirtyChecked = isEnabled === true && savedType === "read-write";
  const { data: dirtyState } = useGetRemoteSyncIsDirtyQuery(
    isDirtyChecked ? undefined : skipToken,
  );
  const hasUnpushedChanges = dirtyState?.is_dirty === true;
  const isReadOnlyBlocked = isDirtyChecked && dirtyState?.is_dirty !== false;

  useEffect(() => {
    if (isReadOnlyBlocked && values["remote-sync-type"] === "read-only") {
      setFieldValue("remote-sync-type", "read-write");
    }
  }, [isReadOnlyBlocked, values, setFieldValue]);

  return (
    <Form>
      <Stack gap="lg">
        <FormTextInput
          name="remote-sync-url"
          label={t`Repository URL`}
          placeholder="https://github.com/your-org/your-repo.git"
        />
        <FormTextInput
          name="remote-sync-token"
          type="password"
          label={t`Access token`}
          description={t`A token with access to the repository. Read-write sync needs write access.`}
        />
        <TestConnectionButton />
        <FormRadioGroup name="remote-sync-type" label={t`Sync mode`}>
          <Stack gap="sm" mt="xs">
            <Radio
              value="read-write"
              label={t`Read-write`}
              description={t`Edit content here and push it to the repository.`}
            />
            <Radio
              value="read-only"
              label={t`Read-only`}
              description={
                hasUnpushedChanges
                  ? t`Push your changes first: switching to read-only discards changes that aren't pushed yet.`
                  : t`Pull content from the repository; synced content can't be edited here.`
              }
              disabled={isReadOnlyBlocked}
            />
          </Stack>
        </FormRadioGroup>
        <FormTextInput
          name="remote-sync-branch"
          label={t`Branch`}
          description={
            isBranchInAppBar
              ? t`Switch branches from the app bar.`
              : t`Leave empty to use the repository's default branch.`
          }
          disabled={isBranchInAppBar}
        />
        {isReadWrite ? (
          <>
            <FormSwitch name="library" label={t`Sync Library`} />
            <CollectionsField
              title={t`Collections to sync`}
              emptyMessage={t`There are no top-level collections yet.`}
              collections={regularCollections}
            />
            {isTenantsEnabled && (
              <CollectionsField
                title={t`Shared tenant collections to sync`}
                emptyMessage={t`There are no shared tenant collections yet.`}
                collections={tenantCollections}
              />
            )}
          </>
        ) : (
          <FormSwitch
            name="remote-sync-auto-import"
            label={t`Pull changes automatically`}
          />
        )}
        <FormErrorMessage />
        <Group justify="space-between">
          {isEnabled ? <DisableButton /> : <span />}
          <Group gap="sm">
            {onCancel && (
              <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton
              label={isEnabled ? t`Save changes` : t`Set up remote sync`}
              variant="filled"
              disabled={!dirty || values["remote-sync-url"].length === 0}
            />
          </Group>
        </Group>
      </Stack>
    </Form>
  );
};

const TestConnectionButton = () => {
  const { values } = useFormikContext<SettingsFormValues>();
  const [testConnection, { isLoading }] = useTestRemoteSyncConnectionMutation();
  const [sendToast] = useToast();

  const handleClick = async () => {
    try {
      await testConnection({
        "remote-sync-url": values["remote-sync-url"],
        "remote-sync-token": values["remote-sync-token"] || undefined,
      }).unwrap();
      sendToast({ message: t`Connected to the repository`, icon: "check" });
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't connect to the repository`),
        variant: "negative",
      });
    }
  };

  return (
    <Group>
      <Button
        loading={isLoading}
        disabled={values["remote-sync-url"].length === 0}
        onClick={handleClick}
      >{t`Test connection`}</Button>
    </Group>
  );
};

const DisableButton = () => {
  const [updateSettings, { isLoading }] = useUpdateRemoteSyncSettingsMutation();
  const { show: showConfirmation, modalContent } = useConfirmation();

  const handleClick = () =>
    showConfirmation({
      title: t`Turn off remote sync?`,
      message: t`Content stays on this instance, but it won't sync with the repository any more.`,
      confirmButtonText: t`Turn off`,
      onConfirm: async () => {
        await updateSettings({ "remote-sync-url": null }).unwrap();
        trackRemoteSyncDeactivated();
      },
    });

  return (
    <>
      <Button
        variant="subtle"
        color="negative"
        loading={isLoading}
        onClick={handleClick}
      >{t`Turn off remote sync`}</Button>
      {modalContent}
    </>
  );
};
