import { useFormikContext } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { useToast } from "metabase/common/hooks/use-toast";
import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  Alert,
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateWorkspaceMutation,
  useLazyListWorkspacesQuery,
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
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
  instance_id: string | undefined;
  initialize_instance: boolean;
};

const NEW_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  instance_id: Yup.string(),
  initialize_instance: Yup.boolean(),
});

const INITIAL_VALUES: NewWorkspaceFormValues = {
  name: "",
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
  const { data: instances = [] } = useListWorkspaceInstancesQuery();
  const { data: workspaces = [] } = useListWorkspacesQuery();
  const [sendToast] = useToast();

  const handleSubmit = async ({
    name,
    instance_id,
    initialize_instance,
  }: NewWorkspaceFormValues) => {
    const workspace = await createWorkspace({
      name,
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
          <DatabasesSection databases={databases} />
          {instances.length > 0 && (
            <InstanceSection instances={instances} workspaces={workspaces} />
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

type DatabasesSectionProps = {
  databases: Database[];
};

function DatabasesSection({ databases }: DatabasesSectionProps) {
  return (
    <Stack gap="sm" role="group" aria-label={t`Databases`}>
      <Box>
        <Text fw="bold">{t`Databases`}</Text>
        <Text c="text-secondary" fz="sm">
          {t`Every database with workspaces enabled will be added to this workspace.`}
        </Text>
      </Box>
      {databases.map((database) => (
        <Group key={database.id} gap="xs" wrap="nowrap" c="text-secondary">
          <FixedSizeIcon name="database" aria-hidden />
          <Text c="inherit">{database.name}</Text>
        </Group>
      ))}
    </Stack>
  );
}

type InstanceSectionProps = {
  instances: WorkspaceInstance[];
  workspaces: Workspace[];
};

function InstanceSection({ instances, workspaces }: InstanceSectionProps) {
  const { values } = useFormikContext<NewWorkspaceFormValues>();

  const workspaceNamesById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name]),
  );

  const selectedInstance = instances.find(
    (instance) => String(instance.id) === values.instance_id,
  );
  const selectedInstanceWorkspaceName =
    selectedInstance?.workspace_id != null
      ? workspaceNamesById.get(selectedInstance.workspace_id)
      : undefined;

  return (
    <>
      <FormSelect
        name="instance_id"
        label={t`Instance`}
        description={t`The connected instance this workspace will be developed on.`}
        placeholder={t`None`}
        data={instances.map((instance) => {
          const workspaceName =
            instance.workspace_id != null
              ? workspaceNamesById.get(instance.workspace_id)
              : undefined;
          return {
            value: String(instance.id),
            label:
              workspaceName != null
                ? t`${instance.name} — used by "${workspaceName}"`
                : instance.workspace_id != null
                  ? t`${instance.name} — in use`
                  : instance.name,
          };
        })}
        clearable
      />
      {selectedInstance?.workspace_id != null && (
        <Alert icon={<Icon name="warning" />} color="warning">
          {selectedInstanceWorkspaceName != null
            ? t`This instance is already used by the workspace "${selectedInstanceWorkspaceName}". Setting it up will erase that workspace's deployment from the instance.`
            : t`This instance is already used by another workspace. Setting it up will erase that workspace's deployment from the instance.`}
        </Alert>
      )}
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
