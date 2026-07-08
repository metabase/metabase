import { useFormikContext } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { useToast } from "metabase/common/hooks/use-toast";
import {
  Form,
  FormCheckbox,
  FormCheckboxGroup,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Checkbox, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorkspaceMutation,
  useLazyListWorkspacesQuery,
  useListWorkspaceInstancesQuery,
  usePushWorkspaceConfigMutation,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceInstance,
} from "metabase-types/api";

import { trackWorkspaceCreated } from "../../../analytics";

type NewWorkspaceModalProps = {
  databases: Database[];
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function NewWorkspaceModal({
  databases,
  opened,
  onCreate,
  onClose,
}: NewWorkspaceModalProps) {
  return (
    <Modal
      title={t`Create a workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <NewWorkspaceForm
        databases={databases}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type NewWorkspaceFormValues = {
  name: string;
  database_ids: string[];
  instance_id: string | undefined;
  initialize_instance: boolean;
};

const NEW_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  database_ids: Yup.array().of(Yup.string()).min(1, Errors.required),
  instance_id: Yup.string(),
  initialize_instance: Yup.boolean(),
});

const INITIAL_VALUES: NewWorkspaceFormValues = {
  name: "",
  database_ids: [],
  instance_id: undefined,
  initialize_instance: true,
};

type NewWorkspaceFormProps = {
  databases: Database[];
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewWorkspaceForm({
  databases,
  onCreate,
  onClose,
}: NewWorkspaceFormProps) {
  const [createWorkspace] = useCreateWorkspaceMutation();
  const [fetchWorkspaces] = useLazyListWorkspacesQuery();
  const [pushConfig] = usePushWorkspaceConfigMutation();
  const { data: instances } = useListWorkspaceInstancesQuery();
  const [sendToast] = useToast();

  const freeInstances = (instances ?? []).filter(
    (instance) => instance.workspace_id == null,
  );

  const handleSubmit = async ({
    name,
    database_ids,
    instance_id,
    initialize_instance,
  }: NewWorkspaceFormValues) => {
    const workspace = await createWorkspace({
      name,
      database_ids: database_ids.map(Number),
      instance_id: instance_id ? Number(instance_id) : undefined,
    }).unwrap();
    await fetchWorkspaces();
    trackWorkspaceCreated({ workspaceId: workspace.id });
    if (instance_id && initialize_instance) {
      try {
        await pushConfig(workspace.id).unwrap();
        sendToast({
          message: t`The instance was set up with this workspace`,
          icon: "check",
        });
      } catch {
        sendToast({
          message: t`The workspace was created, but setting up the instance failed. You can retry from the workspace menu.`,
          icon: "warning",
          toastColor: "feedback-negative",
        });
      }
    }
    onCreate(workspace);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={NEW_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My workspace`}
            data-autofocus
          />
          <FormCheckboxGroup name="database_ids" label={t`Databases`}>
            <Stack gap="sm" mt="sm">
              {databases.map((database) => (
                <Checkbox
                  key={database.id}
                  value={String(database.id)}
                  label={database.name}
                />
              ))}
            </Stack>
          </FormCheckboxGroup>
          {freeInstances.length > 0 && (
            <InstanceSection instances={freeInstances} />
          )}
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create workspace`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type InstanceSectionProps = {
  instances: WorkspaceInstance[];
};

function InstanceSection({ instances }: InstanceSectionProps) {
  const { values } = useFormikContext<NewWorkspaceFormValues>();

  return (
    <>
      <FormSelect
        name="instance_id"
        label={t`Instance`}
        description={t`The connected instance this workspace will be developed on.`}
        placeholder={t`None`}
        data={instances.map((instance) => ({
          value: String(instance.id),
          label: instance.name,
        }))}
        clearable
      />
      {values.instance_id != null && (
        <FormCheckbox
          name="initialize_instance"
          label={t`Set up the instance right away`}
          description={t`Everything currently on the instance will be erased and replaced with this workspace's databases and settings.`}
        />
      )}
    </>
  );
}
