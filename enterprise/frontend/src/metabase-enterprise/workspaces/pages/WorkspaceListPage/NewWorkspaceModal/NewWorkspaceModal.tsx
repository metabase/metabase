import { useFormikContext } from "formik";
import { type ChangeEvent, useState } from "react";
import slugg from "slugg";
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
import {
  useCreateWorkspaceMutation,
  useLazyListWorkspacesQuery,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
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
  target_branch: string;
  database_ids: string[];
};

const NEW_WORKSPACE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  target_branch: Yup.string().required(Errors.required),
  database_ids: Yup.array().of(Yup.string()).min(1, Errors.required),
});

function getInitialValues(databases: Database[]): NewWorkspaceFormValues {
  return {
    name: "",
    target_branch: "",
    database_ids: databases.length === 1 ? [String(databases[0].id)] : [],
  };
}

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
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const [fetchWorkspaces] = useLazyListWorkspacesQuery();

  const handleSubmit = async ({
    name,
    target_branch,
    database_ids,
  }: NewWorkspaceFormValues) => {
    const workspace = await createWorkspace({
      name,
      target_branch,
      database_ids: database_ids.map(Number),
    }).unwrap();
    trackWorkspaceCreated({ workspaceId: workspace.id });
    await provisionWorkspace(workspace.id);
    await fetchWorkspaces();
    onCreate(workspace);
  };

  return (
    <FormProvider
      initialValues={getInitialValues(databases)}
      validationSchema={NEW_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <NewWorkspaceFormFields databases={databases} />
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

type NewWorkspaceFormFieldsProps = {
  databases: Database[];
};

function NewWorkspaceFormFields({ databases }: NewWorkspaceFormFieldsProps) {
  const { setFieldValue } = useFormikContext<NewWorkspaceFormValues>();
  const [isBranchTouched, setIsBranchTouched] = useState(false);

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isBranchTouched) {
      setFieldValue("target_branch", slugg(event.target.value));
    }
  };

  return (
    <>
      <FormTextInput
        name="name"
        label={t`Name`}
        placeholder={t`My workspace`}
        data-autofocus
        onChange={handleNameChange}
      />
      <FormTextInput
        name="target_branch"
        label={t`Branch`}
        placeholder={t`my-workspace`}
        onChange={() => setIsBranchTouched(true)}
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
    </>
  );
}
