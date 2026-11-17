import { t } from "ttag";

import { useBulkUpdateTransformJobsActiveMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Modal, Text } from "metabase/ui";

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
        <Text>
          {t`Any jobs that are currently running will finish and no new job runs will start.`}
        </Text>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton label={t`Disable all`} variant="filled" />
        </Modal.Footer>
      </Form>
    </FormProvider>
  );
}
