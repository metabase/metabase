import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormCheckboxGroup,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Checkbox, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { trackWorkspaceCreated } from "../../../analytics";

type NewWorkspaceModalProps = {
  databases: Database[];
  opened: boolean;
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

export function NewWorkspaceModal({
  databases,
  opened,
  onCreate,
  onClose,
}: NewWorkspaceModalProps) {
  return (
    <Modal
      title={t`Create a workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <NewWorkspaceForm
        databases={databases}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type NewWorkspaceFormValues = {
  name: string;
  database_ids: string[];
};

const NEW_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  database_ids: Yup.array().of(Yup.string()).min(1, Errors.required),
});

const INITIAL_VALUES: NewWorkspaceFormValues = {
  name: "",
  database_ids: [],
};

type NewWorkspaceFormProps = {
  databases: Database[];
  onCreate: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewWorkspaceForm({
  databases,
  onCreate,
  onClose,
}: NewWorkspaceFormProps) {
  const [createWorkspace] = useCreateWorkspaceMutation();

  const handleSubmit = async ({
    name,
    database_ids,
  }: NewWorkspaceFormValues) => {
    const workspace = await createWorkspace({
      name,
      database_ids: database_ids.map(Number),
    }).unwrap();
    trackWorkspaceCreated({ workspaceId: workspace.id });
    onCreate(workspace);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={NEW_WORKSPACE_SCHEMA}
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
          <FormCheckboxGroup name="database_ids" label={t`Databases`}>
            <Stack gap="sm" mt="sm">
              {databases.map((database) => (
                <Checkbox
                  key={database.id}
                  value={String(database.id)}
                  label={database.name}
                />
              ))}
            </Stack>
          </FormCheckboxGroup>
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create workspace`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
