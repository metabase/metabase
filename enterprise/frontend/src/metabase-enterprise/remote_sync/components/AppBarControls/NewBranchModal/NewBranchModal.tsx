import { t } from "ttag";
import * as Yup from "yup";

import { useToast } from "metabase/common/hooks";
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

type NewBranchModalProps = {
  opened: boolean;
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

export const NewBranchModal = ({ opened, onClose }: NewBranchModalProps) => (
  <Modal opened={opened} title={t`Push to a new branch`} onClose={onClose}>
    <ModalBody onClose={onClose} />
  </Modal>
);

type ModalBodyProps = {
  onClose: () => void;
};

const ModalBody = ({ onClose }: ModalBodyProps) => {
  const [stashChanges] = useStashChangesMutation();
  const [sendToast] = useToast();

  const handleSubmit = async ({ branch, message }: NewBranchFormValues) => {
    await stashChanges({ new_branch: branch.trim(), message }).unwrap();
    trackBranchCreated({ triggeredFrom: "branch-picker" });
    sendToast({ message: t`Pushing to ${branch}`, icon: "check" });
    onClose();
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
