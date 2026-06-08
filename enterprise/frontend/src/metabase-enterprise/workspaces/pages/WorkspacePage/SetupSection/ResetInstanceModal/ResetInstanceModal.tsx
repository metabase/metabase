import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useResetWorkspaceDeploymentMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type ResetInstanceModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function ResetInstanceModal({
  workspace,
  opened,
  onClose,
}: ResetInstanceModalProps) {
  return (
    <Modal
      title={t`Reset the development instance?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ResetInstanceForm workspace={workspace} onClose={onClose} />
    </Modal>
  );
}

type ResetInstanceFormProps = {
  workspace: Workspace;
  onClose: () => void;
};

function ResetInstanceForm({ workspace, onClose }: ResetInstanceFormProps) {
  const [resetWorkspaceDeployment] = useResetWorkspaceDeploymentMutation();

  const handleSubmit = async () => {
    const instance = workspace.workspace_instance;
    if (instance == null) {
      return;
    }
    await resetWorkspaceDeployment({
      id: workspace.id,
      instance_id: instance.id,
    }).unwrap();
    onClose();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`This instance will be reset to its initial state and freed up, so it can be used to set up another workspace.`}
          </Text>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Reset the instance`}
              variant="filled"
              color="danger"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
