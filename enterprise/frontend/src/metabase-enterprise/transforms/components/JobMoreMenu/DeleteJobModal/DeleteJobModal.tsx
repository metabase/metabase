import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteTransformJobMutation } from "metabase-enterprise/api";
import type { TransformJobId } from "metabase-types/api";

type DeleteJobModalProps = {
  jobId: TransformJobId;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteJobModal({
  jobId,
  onDelete,
  onClose,
}: DeleteJobModalProps) {
  return (
    <Modal title={t`Delete this job?`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <DeleteJobForm jobId={jobId} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

type DeleteJobFormProps = {
  jobId: TransformJobId;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteJobForm({ jobId, onDelete, onClose }: DeleteJobFormProps) {
  const [deleteJob] = useDeleteTransformJobMutation();

  const handleSubmit = async () => {
    await deleteJob(jobId).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>{t`Deleting this job won’t delete any transforms.`}</Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete job`}
              variant="filled"
              color="error"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
