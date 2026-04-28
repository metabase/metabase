import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useDispatch } from "metabase/redux";
import { Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";

type CreateWorkspaceFormValues = {
  name: string;
};

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

const INITIAL_VALUES: CreateWorkspaceFormValues = {
  name: "",
};

type CreateWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function CreateWorkspaceModal({
  opened,
  onClose,
}: CreateWorkspaceModalProps) {
  return (
    <Modal
      title={t`New workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <CreateWorkspaceForm onCancel={onClose} />
    </Modal>
  );
}

type CreateWorkspaceFormProps = {
  onCancel: () => void;
};

function CreateWorkspaceForm({ onCancel }: CreateWorkspaceFormProps) {
  const dispatch = useDispatch();
  const [createWorkspace] = useCreateWorkspaceMutation();

  const handleSubmit = async (values: CreateWorkspaceFormValues) => {
    const workspace = await createWorkspace({ name: values.name }).unwrap();
    onCancel();
    dispatch(push(Urls.adminWorkspace(workspace.id)));
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`My workspace`}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
