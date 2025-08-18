import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteTransformJobMutation } from "metabase-enterprise/api";

import type { TransformJobInfo } from "../../types";

type DeleteJobModalProps = {
  job: TransformJobInfo;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteJobModal({
  job,
  onDelete,
  onClose,
}: DeleteJobModalProps) {
  return (
    <Modal title={t`Delete this job?`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <DeleteJobForm job={job} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

type DeleteJobFormProps = {
  job: TransformJobInfo;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteJobForm({ job, onDelete, onClose }: DeleteJobFormProps) {
  const [deleteJob] = useDeleteTransformJobMutation();

  const handleSubmit = async () => {
    if (job.id != null) {
      await deleteJob(job.id).unwrap();
      onDelete();
    }
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
