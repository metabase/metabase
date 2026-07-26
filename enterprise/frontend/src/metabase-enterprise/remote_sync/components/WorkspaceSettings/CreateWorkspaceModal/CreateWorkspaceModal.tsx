import { useMemo } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { Modal } from "metabase/ui";
import {
  useCreateBranchMutation,
  useCreateWorkspaceMutation,
  useGetBranchesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  WorkspaceBranchForm,
  type WorkspaceBranchFormValues,
} from "../../WorkspaceBranchForm";

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
  const [createBranch, createBranchResult] = useCreateBranchMutation();
  const [createWorkspace] = useCreateWorkspaceMutation();

  const validationSchema = useMemo(
    () => getValidationSchema(workspaces, mainBranch),
    [workspaces, mainBranch],
  );

  const isNewBranch = (branch: string) => !branches.includes(branch);

  const getSubmitLabel = (branch: string | null) =>
    branch && isNewBranch(branch)
      ? t`Create branch and workspace`
      : t`Create workspace`;

  const handleSubmit = async ({ branch }: WorkspaceBranchFormValues) => {
    if (!branch) {
      return;
    }

    if (isNewBranch(branch)) {
      // Guard against re-creating the branch if a previous attempt created it but the workspace
      // creation failed: the branch mutation still holds the last successful args.
      const alreadyCreated =
        createBranchResult.isSuccess &&
        createBranchResult.originalArgs?.name === branch;
      if (!alreadyCreated) {
        await createBranch({ name: branch }).unwrap();
      }
    }

    await createWorkspace({ branch }).unwrap();
    onClose();
  };

  return (
    <WorkspaceBranchForm
      branches={branches}
      validationSchema={validationSchema}
      getSubmitLabel={getSubmitLabel}
      onSubmit={handleSubmit}
      onCancel={onClose}
    />
  );
}
