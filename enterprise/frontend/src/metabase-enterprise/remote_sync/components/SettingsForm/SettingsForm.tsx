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
import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "metabase/settings-components";
import { Button, Divider, Group, Loader, Radio, Stack } from "metabase/ui";
import {
  useCreateLibraryMutation,
  useGetRemoteSyncIsDirtyQuery,
  useTestRemoteSyncConnectionMutation,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";
import type {
  RegularCollectionId,
  RemoteSyncItem,
  RemoteSyncTaskId,
} from "metabase-types/api";
import { isRemoteSyncUnsyncedDependenciesError } from "metabase-types/guards";

import {
  trackBranchSwitched,
  trackRemoteSyncSettingsChanged,
} from "../../analytics";
import type { SettingsFormValues, SyncableCollection } from "../../types";
import { SyncActions } from "../SyncActions";
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

export function SettingsForm(props: SettingsFormProps) {
  const { isLoading: isLoadingSettings } = useGetAdminSettingsDetailsQuery();
  const syncableCollections = useSyncableCollections();

  if (isLoadingSettings || syncableCollections.isLoading) {
    return <Loader />;
  }

  return (
    <LoadedSettingsForm {...props} syncableCollections={syncableCollections} />
  );
}

type LoadedSettingsFormProps = {
  triggeredFrom: "admin-settings" | "data-studio";
  syncableCollections: SyncableCollections;
  onSaved?: () => void;
  onCancel?: () => void;
};

function LoadedSettingsForm({
  triggeredFrom,
  syncableCollections: { library, regularCollections, tenantCollections },
  onSaved,
  onCancel,
}: LoadedSettingsFormProps) {
  const collections = useMemo(
    () => [...regularCollections, ...tenantCollections],
    [regularCollections, tenantCollections],
  );
  const initialValues = useSettingsFormValues(collections);
  const [updateSettings] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary] = useCreateLibraryMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [unsyncedDependencies, setUnsyncedDependencies] = useState<
    RemoteSyncItem[] | null
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
    sendToast({ message: t`Git integration settings saved`, icon: "check" });
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
            // The admin page lays the form out as settings cards; the Data
            // Studio modal keeps a single column.
            layout={triggeredFrom === "admin-settings" ? "cards" : "stack"}
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
}

type SettingsFormBodyProps = {
  regularCollections: SyncableCollection[];
  tenantCollections: SyncableCollection[];
  layout: "cards" | "stack";
  onCancel?: () => void;
};

function SettingsFormBody({
  regularCollections,
  tenantCollections,
  layout,
  onCancel,
}: SettingsFormBodyProps) {
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
  // PROTOTYPE: mocked. There's no setting for this yet, so it isn't saved.
  const [userContentAccess, setUserContentAccess] = useState("allowed");

  useEffect(() => {
    if (isReadOnlyBlocked && values.type === "read-only") {
      setFieldValue("type", "read-write");
    }
  }, [isReadOnlyBlocked, values, setFieldValue]);

  const isCards = layout === "cards";

  const connectionFields = (
    <>
      <FormTextInput
        name="url"
        label={t`Repository URL`}
        placeholder="https://git-host.example.com/yourcompany/repo.git"
      />
      <FormTextInput
        name="token"
        type="password"
        label={t`Access token`}
        description={t`Required for private repositories, and for git-backed version control, which needs write access.`}
      />
      <TestConnectionButton />
    </>
  );

  const modeField = (
    <FormRadioGroup
      name="type"
      label={isCards ? undefined : t`How do you want to sync with git?`}
      aria-label={t`How do you want to sync with git?`}
    >
      <Stack gap="md" mt={isCards ? 0 : "xs"}>
        <Radio
          value="read-only"
          label={t`Publish from Git`}
          description={
            hasUnpushedChanges
              ? t`Push your changes first: switching discards changes that aren't pushed yet.`
              : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Git integration settings are admin-only.
                t`Content from your synced git repo will appear in Metabase’s navigation, and won’t be editable.`
          }
          disabled={isReadOnlyBlocked}
        />
        <Radio
          value="read-write"
          label={t`Use git-backed version control`}
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Git integration settings are admin-only.
          description={t`Metabase acts as a git client, allowing both pushing and pulling to the git repo.`}
        />
      </Stack>
    </FormRadioGroup>
  );

  // Settings the design doesn't place: they live under Advanced.
  const advancedFields = (
    <>
      <FormTextInput
        name="branch"
        label={t`Branch`}
        description={t`Leave empty to use the repository's default branch.`}
      />
      {isReadWrite ? (
        <>
          <CollectionsField
            title={t`Collections to sync`}
            description={t`Library and transforms always sync.`}
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
    </>
  );

  const footer = (
    <>
      <FormErrorMessage />
      <Group justify="flex-end" gap="sm">
        {onCancel && (
          <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
        )}
        <FormSubmitButton
          label={isEnabled ? t`Save changes` : t`Set up git integration`}
          variant="filled"
          disabled={!dirty || values.url.length === 0}
        />
      </Group>
    </>
  );

  if (!isCards) {
    return (
      <Form>
        <Stack gap="lg">
          {connectionFields}
          {modeField}
          {advancedFields}
          {footer}
        </Stack>
      </Form>
    );
  }

  return (
    <Form>
      <Stack gap="xl">
        <SettingsSection
          title={t`How do you want to sync with git?`}
          titleProps={SETTINGS_CARD_TITLE_PROPS}
          stackProps={SETTINGS_CARD_STACK_PROPS}
        >
          {modeField}
        </SettingsSection>
        <SettingsSection
          title={t`Also allow user-generated content?`}
          titleProps={SETTINGS_CARD_TITLE_PROPS}
          stackProps={SETTINGS_CARD_STACK_PROPS}
        >
          <Radio.Group
            value={userContentAccess}
            onChange={setUserContentAccess}
            aria-label={t`Also allow user-generated content?`}
          >
            <Stack gap="md">
              <Radio
                value="allowed"
                label={t`Yes`}
                description={t`Content from your git repo will coexist with user-generated content, which will appear in a separate section of the nav.`}
              />
              <Radio
                value="blocked"
                label={t`No`}
                description={t`Only content from the synced repository will appear. Users won’t be able to save dashboards, documents, or reports. Existing user generated content will be hidden, not deleted.`}
              />
            </Stack>
          </Radio.Group>
        </SettingsSection>
        <SettingsSection
          title={t`Connect to a repository`}
          titleProps={SETTINGS_CARD_TITLE_PROPS}
          stackProps={SETTINGS_CARD_STACK_PROPS}
        >
          {connectionFields}
        </SettingsSection>
        <CollapsibleSettingsSection
          title={t`Advanced`}
          description={t`By default, this instance will regularly auto-sync with the main branch in git.`}
        >
          <Stack gap="lg">
            {advancedFields}
            {isEnabled && (
              <>
                <Divider />
                <SyncActions />
              </>
            )}
          </Stack>
        </CollapsibleSettingsSection>
        {footer}
      </Stack>
    </Form>
  );
}

function TestConnectionButton() {
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
}
