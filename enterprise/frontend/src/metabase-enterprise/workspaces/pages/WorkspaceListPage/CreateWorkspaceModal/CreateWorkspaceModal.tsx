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
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Box, Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";

type CreateWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
};

type CreateWorkspaceValues = {
  name: string;
};

const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

const INITIAL_VALUES: CreateWorkspaceValues = { name: "" };

export function CreateWorkspaceModal({
  opened,
  onClose,
}: CreateWorkspaceModalProps) {
  return (
    <Modal
      title={t`Create workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <CreateWorkspaceForm onClose={onClose} />
    </Modal>
  );
}

type CreateWorkspaceFormProps = {
  onClose: () => void;
};

function CreateWorkspaceForm({ onClose }: CreateWorkspaceFormProps) {
  const dispatch = useDispatch();
  const [createWorkspace] = useCreateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleSubmit = async ({ name }: CreateWorkspaceValues) => {
    const { data: workspace, error } = await createWorkspace({
      name: name.trim(),
    });
    if (error || workspace == null) {
      sendErrorToast(t`Failed to create workspace`);
      return;
    }
    onClose();
    dispatch(push(Urls.workspace(workspace.id)));
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
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
