import { t } from "ttag";

import { useBulkUpdateTransformJobsActiveMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";

type DisableAllJobsModalProps = {
  onConfirm: () => void;
  onClose: () => void;
};

export function DisableAllJobsModal({
  onConfirm,
  onClose,
}: DisableAllJobsModalProps) {
  return (
    <Modal
      title={t`Disable all jobs?`}
      opened
      padding="xl"
      onClose={onClose}
      onClick={(event) => event.stopPropagation()}
    >
      <FocusTrap.InitialFocus />
      <DisableAllJobsForm onConfirm={onConfirm} onClose={onClose} />
    </Modal>
  );
}

function DisableAllJobsForm({ onConfirm, onClose }: DisableAllJobsModalProps) {
  const [bulkUpdate] = useBulkUpdateTransformJobsActiveMutation();

  const handleSubmit = async () => {
    const { failed } = await bulkUpdate({ active: false }).unwrap();
    if (failed > 0) {
      throw new Error(t`Failed to disable all jobs`);
    }
    onConfirm();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>
            {t`Any jobs that are currently running will finish and no new job runs will start.`}
          </Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Disable all`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
