import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useStashChangesMutation } from "metabase-enterprise/api";

import { trackBranchCreated } from "../../../analytics";
import type { SyncTask } from "../types";

type NewBranchModalProps = {
  opened: boolean;
  onTaskStarted: (task: SyncTask) => void;
  onClose: () => void;
};

type NewBranchFormValues = {
  branch: string;
  message: string;
};

const getNewBranchSchema = () =>
  Yup.object({
    branch: Yup.string().trim().required(Errors.required),
    message: Yup.string().trim().required(Errors.required),
  });

export const NewBranchModal = ({
  opened,
  onTaskStarted,
  onClose,
}: NewBranchModalProps) => (
  <Modal opened={opened} title={t`Push to a new branch`} onClose={onClose}>
    <NewBranchModalBody onTaskStarted={onTaskStarted} onClose={onClose} />
  </Modal>
);

type NewBranchModalBodyProps = {
  onTaskStarted: (task: SyncTask) => void;
  onClose: () => void;
};

const NewBranchModalBody = ({
  onTaskStarted,
  onClose,
}: NewBranchModalBodyProps) => {
  const [stashChanges] = useStashChangesMutation();

  const handleSubmit = async ({ branch, message }: NewBranchFormValues) => {
    const newBranch = branch.trim();
    const { task_id } = await stashChanges({
      new_branch: newBranch,
      message,
    }).unwrap();
    trackBranchCreated({ triggeredFrom: "branch-picker" });
    onTaskStarted({ id: task_id, title: t`Pushing to ${newBranch}` });
  };

  return (
    <FormProvider<NewBranchFormValues>
      initialValues={{ branch: "", message: "" }}
      validationSchema={getNewBranchSchema()}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput name="branch" label={t`Branch name`} />
          <FormTextarea name="message" label={t`Commit message`} />
          <FormErrorMessage />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Push`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
};
