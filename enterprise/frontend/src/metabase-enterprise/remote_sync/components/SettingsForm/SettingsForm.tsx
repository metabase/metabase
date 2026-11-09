import { useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
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
  trackBranchSwitched,
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
import { getConnectionRequest, getSettingsRequest } from "./utils";

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
  const initialValues = useSettingsFormValues(collections);
  const [updateSettings] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary] = useCreateLibraryMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [unsyncedDependencies, setUnsyncedDependencies] = useState<
    RemoteSyncUnsyncedDependency[] | null
  >(null);

  const getLibraryChange = async (): Promise<
    Record<RegularCollectionId, boolean>
  > => {
    if (library) {
      return library.isRemoteSynced ? {} : { [library.id]: true };
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
    const isReadWrite = values.type === "read-write";
    const libraryChange = isReadWrite ? await getLibraryChange() : {};
    setUnsyncedDependencies(null);
    const { task_id } = await updateSettings({
      ...getSettingsRequest(
        values,
        isReadWrite ? { ...changedCollections, ...libraryChange } : null,
      ),
    })
      .unwrap()
      .catch((error: unknown) => {
        if (isRemoteSyncUnsyncedDependenciesError(error)) {
          setUnsyncedDependencies(error.data.unsynced_dependencies);
        }
        throw error;
      });
    trackRemoteSyncSettingsChanged({ triggeredFrom });
    if (initialValues.url !== "" && values.branch !== initialValues.branch) {
      trackBranchSwitched({ triggeredFrom: "admin-settings" });
    }
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
  const isReadWrite = values.type === "read-write";
  const isDirtyChecked = isEnabled === true && savedType === "read-write";
  const { data: dirtyState } = useGetRemoteSyncIsDirtyQuery(
    isDirtyChecked ? undefined : skipToken,
  );
  const hasUnpushedChanges = dirtyState?.is_dirty === true;
  const isReadOnlyBlocked = isDirtyChecked && dirtyState?.is_dirty !== false;

  useEffect(() => {
    if (isReadOnlyBlocked && values.type === "read-only") {
      setFieldValue("type", "read-write");
    }
  }, [isReadOnlyBlocked, values, setFieldValue]);

  return (
    <Form>
      <Stack gap="lg">
        <FormTextInput
          name="url"
          label={t`Repository URL`}
          placeholder="https://github.com/your-org/your-repo.git"
        />
        <FormTextInput
          name="token"
          type="password"
          label={t`Access token`}
          description={t`A token with access to the repository. Read-write sync needs write access.`}
        />
        <TestConnectionButton />
        <FormRadioGroup name="type" label={t`Sync mode`}>
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
          name="branch"
          label={t`Branch`}
          description={t`Leave empty to use the repository's default branch.`}
        />
        {isReadWrite ? (
          <>
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
          <FormSwitch name="autoImport" label={t`Pull changes automatically`} />
        )}
        <FormErrorMessage />
        <Group justify="flex-end" gap="sm">
          {onCancel && (
            <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton
            label={isEnabled ? t`Save changes` : t`Set up remote sync`}
            variant="filled"
            disabled={!dirty || values.url.length === 0}
          />
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
      await testConnection(getConnectionRequest(values)).unwrap();
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
        disabled={values.url.length === 0}
        onClick={handleClick}
      >{t`Test connection`}</Button>
    </Group>
  );
};
