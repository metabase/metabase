import { t } from "ttag";

import { useDeleteTransformJobMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Modal, Text } from "metabase/ui";
import type { TransformJob } from "metabase-types/api";

type DeleteJobModalProps = {
  job: TransformJob;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteJobModal({
  job,
  onDelete,
  onClose,
}: DeleteJobModalProps) {
  return (
    <Modal
      title={t`Delete this job?`}
      opened
      onClose={onClose}
      onClick={(event) => event.stopPropagation()}
    >
      <FocusTrap.InitialFocus />
      <DeleteJobForm job={job} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

type DeleteJobFormProps = {
  job: TransformJob;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteJobForm({ job, onDelete, onClose }: DeleteJobFormProps) {
  const [deleteJob] = useDeleteTransformJobMutation();

  const handleSubmit = async () => {
    await deleteJob(job.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Text>{t`Deleting this job won’t delete any transforms.`}</Text>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton
            label={t`Delete job`}
            variant="filled"
            color="negative"
          />
        </Modal.Footer>
      </Form>
    </FormProvider>
  );
}
