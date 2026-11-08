import { useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

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
import { useSetting } from "metabase/settings";
import { Button, Group, Loader, Radio, Stack } from "metabase/ui";
import {
  useCreateLibraryMutation,
  useTestRemoteSyncConnectionMutation,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";

import {
  trackRemoteSyncDeactivated,
  trackRemoteSyncSettingsChanged,
} from "../../analytics";
import type { SettingsFormValues, SyncableCollection } from "../../types";

import { CollectionsField } from "./CollectionsField";
import {
  useIsSettingsFormLoading,
  useLibraryCollection,
  useSettingsFormValues,
  useSyncableCollections,
  useSyncableTenantCollections,
} from "./hooks";

type SettingsFormProps = {
  triggeredFrom: "admin-settings" | "data-studio";
  onSaved?: () => void;
  onCancel?: () => void;
};

export const SettingsForm = (props: SettingsFormProps) => {
  const isLoading = useIsSettingsFormLoading();

  if (isLoading) {
    return <Loader />;
  }

  return <LoadedSettingsForm {...props} />;
};

const LoadedSettingsForm = ({
  triggeredFrom,
  onSaved,
  onCancel,
}: SettingsFormProps) => {
  const regularCollections = useSyncableCollections();
  const tenantCollections = useSyncableTenantCollections();
  const collections = useMemo(
    () => [...regularCollections, ...tenantCollections],
    [regularCollections, tenantCollections],
  );
  const library = useLibraryCollection();
  const initialValues = useSettingsFormValues(collections, library);
  const [updateSettings] = useUpdateRemoteSyncSettingsMutation();
  const [createLibrary] = useCreateLibraryMutation();

  const getLibraryChange = async (
    isLibrarySynced: boolean,
  ): Promise<Record<number, boolean>> => {
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
    await updateSettings({
      "remote-sync-url": values["remote-sync-url"],
      "remote-sync-token": values["remote-sync-token"] || null,
      "remote-sync-type": values["remote-sync-type"],
      "remote-sync-branch": values["remote-sync-branch"] || null,
      "remote-sync-auto-import": values["remote-sync-auto-import"],
      "remote-sync-transforms": values["remote-sync-transforms"],
      collections: isReadWrite
        ? { ...changedCollections, ...libraryChange }
        : null,
    }).unwrap();
    trackRemoteSyncSettingsChanged({ triggeredFrom });
    sendToast({ message: t`Remote sync settings saved`, icon: "check" });
    onSaved?.();
  };

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      <SettingsFormBody
        regularCollections={regularCollections}
        tenantCollections={tenantCollections}
        onCancel={onCancel}
      />
    </FormProvider>
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
  const { values, dirty } = useFormikContext<SettingsFormValues>();
  const isEnabled = useSetting("remote-sync-enabled");
  const isReadWrite = values["remote-sync-type"] === "read-write";

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
          description={t`A token with read and write access to the repository.`}
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
              description={t`Pull content from the repository; synced content can't be edited here.`}
            />
          </Stack>
        </FormRadioGroup>
        <FormTextInput
          name="remote-sync-branch"
          label={t`Branch`}
          description={t`The default branch of the repository when empty.`}
          disabled={isEnabled === true && isReadWrite}
        />
        {isReadWrite ? (
          <>
            <FormSwitch name="library" label={t`Sync Library`} />
            <FormSwitch
              name="remote-sync-transforms"
              label={t`Sync Transforms`}
            />
            <CollectionsField
              title={t`Collections to sync`}
              emptyMessage={t`There are no top-level collections yet.`}
              collections={regularCollections}
            />
            {isTenantsEnabled && (
              <CollectionsField
                title={t`Shared tenant collections to sync`}
                emptyMessage={t`No shared tenant collections found`}
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
        "remote-sync-token": values["remote-sync-token"],
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
