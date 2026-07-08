import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { usePushWorkspaceConfigMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type PushConfigModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function PushConfigModal({
  workspace,
  opened,
  onClose,
}: PushConfigModalProps) {
  const [pushConfig] = usePushWorkspaceConfigMutation();
  const [sendToast] = useToast();
  const instance = workspace.instance;

  const handleSubmit = async () => {
    await pushConfig(workspace.id).unwrap();
    sendToast({
      message: t`The instance was set up with this workspace`,
      icon: "check",
    });
    onClose();
  };

  if (instance == null) {
    return null;
  }

  return (
    <Modal
      title={t`Set up "${instance.name}"?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="lg">
            <Text>
              {t`Everything currently on ${instance.url} will be erased and replaced with this workspace's databases and settings. This can't be undone.`}
            </Text>
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Erase and set up`}
                variant="filled"
                color="feedback-negative"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
