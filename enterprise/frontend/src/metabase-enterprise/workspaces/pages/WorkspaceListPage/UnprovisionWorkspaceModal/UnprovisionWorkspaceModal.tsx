import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useResetWorkspaceDeploymentMutation } from "metabase-enterprise/api";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";

export type UnprovisionWorkspaceModalProps = {
  workspace: Workspace;
  instance: WorkspaceInstance;
  opened: boolean;
  onUnprovision: () => void;
  onClose: () => void;
};

export function UnprovisionWorkspaceModal({
  workspace,
  instance,
  opened,
  onUnprovision,
  onClose,
}: UnprovisionWorkspaceModalProps) {
  return (
    <Modal
      title={t`Unprovision this workspace?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UnprovisionWorkspaceForm
        workspace={workspace}
        instance={instance}
        onUnprovision={onUnprovision}
        onClose={onClose}
      />
    </Modal>
  );
}

type UnprovisionWorkspaceFormProps = {
  workspace: Workspace;
  instance: WorkspaceInstance;
  onUnprovision: () => void;
  onClose: () => void;
};

function UnprovisionWorkspaceForm({
  workspace,
  instance,
  onUnprovision,
  onClose,
}: UnprovisionWorkspaceFormProps) {
  const [resetWorkspaceDeployment] = useResetWorkspaceDeploymentMutation();

  const handleSubmit = async () => {
    await resetWorkspaceDeployment({
      id: workspace.id,
      workspace_instance_id: instance.id,
    }).unwrap();
    onUnprovision();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`This will free up the developer instance used by this workspace.`}
          </Text>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Unprovision`}
              variant="filled"
              color="danger"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
