import { useMemo } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import {
  useCreateWorkspaceMutation,
  useGetBranchesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { getValidationSchema } from "./utils";

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
      size="30rem"
      padding="xl"
      opened={opened}
      onClose={onClose}
      title={t`Create a workspace`}
    >
      <WorkspaceFormLoader onClose={onClose} />
    </Modal>
  );
}

type WorkspaceFormLoaderProps = {
  onClose: () => void;
};

function WorkspaceFormLoader({ onClose }: WorkspaceFormLoaderProps) {
  const mainBranch = useSetting("remote-sync-branch");
  const {
    data: branches = { items: [] },
    isLoading: isLoadingBranches,
    error: branchesError,
  } = useGetBranchesQuery();
  const {
    data: workspaces = [],
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();

  const isLoading = isLoadingBranches || isLoadingWorkspaces;
  const error = branchesError ?? workspacesError;

  if (isLoading || error) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceForm
      branches={branches.items}
      workspaces={workspaces}
      mainBranch={mainBranch}
      onClose={onClose}
    />
  );
}

type CreateWorkspaceFormValues = {
  branch: string | null;
};

const INITIAL_VALUES: CreateWorkspaceFormValues = { branch: null };

type WorkspaceFormProps = {
  branches: string[];
  workspaces: Workspace[];
  mainBranch: string | null | undefined;
  onClose: () => void;
};

function WorkspaceForm({
  branches,
  workspaces,
  mainBranch,
  onClose,
}: WorkspaceFormProps) {
  const [createWorkspace] = useCreateWorkspaceMutation();

  const validationSchema = useMemo(
    () => getValidationSchema(workspaces, mainBranch),
    [workspaces, mainBranch],
  );

  const handleSubmit = async ({ branch }: CreateWorkspaceFormValues) => {
    if (!branch) {
      return;
    }

    await createWorkspace({ branch }).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="xl">
          <FormSelect
            name="branch"
            label={t`Branch`}
            placeholder={t`Select a branch`}
            data={branches}
            searchable
            required
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton variant="filled" label={t`Create`} />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
