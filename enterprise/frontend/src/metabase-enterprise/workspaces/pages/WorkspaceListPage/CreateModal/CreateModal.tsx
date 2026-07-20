import { useEffect, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken } from "metabase/api";
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
  useGetWorkspaceQuery,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Database, Workspace, WorkspaceId } from "metabase-types/api";

import { trackWorkspaceCreated } from "../../../analytics";
import { POLLING_INTERVAL } from "../../../constants";
import { isProvisioned, isProvisioning } from "../../../utils";
import { ProvisionProgress, ProvisionSuccess } from "../ProvisionModal";

type CreateModalProps = {
  databases: Database[];
  opened: boolean;
  onClose: () => void;
};

export function CreateModal({ databases, opened, onClose }: CreateModalProps) {
  return (
    <Modal
      title={t`Create a workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <CreateModalBody databases={databases} onClose={onClose} />
    </Modal>
  );
}

type CreateModalBodyProps = {
  databases: Database[];
  onClose: () => void;
};

function CreateModalBody({ databases, onClose }: CreateModalBodyProps) {
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [provisionWorkspace, { isLoading }] = useProvisionWorkspaceMutation();
  const { data: workspace } = useGetWorkspaceQuery(workspaceId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  useEffect(() => {
    setIsPolling(workspace != null && isProvisioning(workspace));
  }, [workspace]);

  const handleCreated = (workspace: Workspace) => {
    setWorkspaceId(workspace.id);
    provisionWorkspace(workspace.id);
  };

  if (workspace == null) {
    return (
      <NewWorkspaceForm
        databases={databases}
        disabled={workspaceId != null}
        onCreated={handleCreated}
        onClose={onClose}
      />
    );
  }

  if (isProvisioned(workspace)) {
    return <ProvisionSuccess workspace={workspace} onDone={onClose} />;
  }

  return (
    <ProvisionProgress
      workspace={workspace}
      isProvisioning={isLoading}
      onProvision={() => provisionWorkspace(workspace.id)}
      onClose={onClose}
    />
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

function getInitialValues(databases: Database[]): NewWorkspaceFormValues {
  return {
    name: "",
    database_ids: databases.length === 1 ? [String(databases[0].id)] : [],
  };
}

type NewWorkspaceFormProps = {
  databases: Database[];
  disabled: boolean;
  onCreated: (workspace: Workspace) => void;
  onClose: () => void;
};

function NewWorkspaceForm({
  databases,
  disabled,
  onCreated,
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
    onCreated(workspace);
  };

  return (
    <FormProvider
      initialValues={getInitialValues(databases)}
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
            <FormSubmitButton
              label={t`Create workspace`}
              variant="filled"
              disabled={disabled}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
