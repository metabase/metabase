import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useSetupWorkspaceDeploymentMutation } from "metabase-enterprise/api";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";

export type ProvisionWorkspaceModalProps = {
  workspace: Workspace;
  instances: WorkspaceInstance[];
  opened: boolean;
  onProvision: () => void;
  onClose: () => void;
};

export function ProvisionWorkspaceModal({
  workspace,
  instances,
  opened,
  onProvision,
  onClose,
}: ProvisionWorkspaceModalProps) {
  return (
    <Modal
      title={t`Provision this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <ProvisionWorkspaceForm
        workspace={workspace}
        instances={instances}
        onProvision={onProvision}
        onClose={onClose}
      />
    </Modal>
  );
}

type ProvisionWorkspaceFormValues = {
  instanceId: string | null;
};

const PROVISION_WORKSPACE_SCHEMA = Yup.object({
  instanceId: Yup.string().nullable().required(Errors.required),
});

type ProvisionWorkspaceFormProps = {
  workspace: Workspace;
  instances: WorkspaceInstance[];
  onProvision: () => void;
  onClose: () => void;
};

function ProvisionWorkspaceForm({
  workspace,
  instances,
  onProvision,
  onClose,
}: ProvisionWorkspaceFormProps) {
  const [setupWorkspaceDeployment] = useSetupWorkspaceDeploymentMutation();

  const freeInstance = instances.find(
    (instance) => instance.workspace_id == null,
  );
  const initialValues: ProvisionWorkspaceFormValues = {
    instanceId: freeInstance != null ? String(freeInstance.id) : null,
  };
  const options = instances.map((instance) => ({
    value: String(instance.id),
    label: instance.name,
    disabled: instance.workspace_id != null,
  }));

  const handleSubmit = async ({ instanceId }: ProvisionWorkspaceFormValues) => {
    await setupWorkspaceDeployment({
      id: workspace.id,
      workspace_instance_id: Number(instanceId),
    }).unwrap();
    onProvision();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={PROVISION_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormSelect
            name="instanceId"
            label={t`Developer instance`}
            data={options}
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Provision`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
