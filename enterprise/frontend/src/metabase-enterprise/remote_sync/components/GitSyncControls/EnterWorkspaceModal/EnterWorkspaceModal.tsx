import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateUserMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Modal } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateBranchMutation,
  useCreateWorkspaceMutation,
  useGetBranchesQuery,
  useImportChangesMutation,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  WorkspaceBranchForm,
  type WorkspaceBranchFormValues,
} from "../../WorkspaceBranchForm";

const VALIDATION_SCHEMA = Yup.object({
  branch: Yup.string().nullable().required(Errors.required),
});

type EnterWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
  currentWorkspaceId: number | null | undefined;
};

/**
 * Thin modal shell — no hooks or queries of its own, so it's cheap to render even when closed. The title
 * is derived from props alone; all the stateful work lives in {@link EnterWorkspaceModalBody}, which only
 * mounts while the modal is open.
 */
export function EnterWorkspaceModal({
  opened,
  onClose,
  currentWorkspaceId,
}: EnterWorkspaceModalProps) {
  return (
    <Modal
      size="30rem"
      padding="xl"
      opened={opened}
      onClose={onClose}
      title={
        currentWorkspaceId != null ? t`Switch workspace` : t`Enter workspace`
      }
    >
      <EnterWorkspaceModalBody
        currentWorkspaceId={currentWorkspaceId}
        onClose={onClose}
      />
    </Modal>
  );
}

type EnterWorkspaceModalBodyProps = {
  onClose: () => void;
  currentWorkspaceId: number | null | undefined;
};

function EnterWorkspaceModalBody({
  onClose,
  currentWorkspaceId,
}: EnterWorkspaceModalBodyProps) {
  const [importChanges] = useImportChangesMutation();
  const [sendToast] = useToast();

  const handleEntered = useCallback(
    (branch: string) => {
      importChanges({ branch, expected_branch: branch })
        .unwrap()
        .catch((error) => {
          sendToast({
            icon: "warning",
            message: getErrorMessage(error, t`Failed to pull from remote`),
          });
        });
      onClose();
    },
    [importChanges, sendToast, onClose],
  );

  return (
    <EnterWorkspaceFormLoader
      currentWorkspaceId={currentWorkspaceId}
      onEntered={handleEntered}
      onCancel={onClose}
    />
  );
}

type EnterWorkspaceFormLoaderProps = {
  currentWorkspaceId: number | null | undefined;
  onEntered: (branch: string) => void;
  onCancel: () => void;
};

function EnterWorkspaceFormLoader({
  currentWorkspaceId,
  onEntered,
  onCancel,
}: EnterWorkspaceFormLoaderProps) {
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
    <EnterWorkspaceForm
      branches={branches.items}
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      onEntered={onEntered}
      onCancel={onCancel}
    />
  );
}

type EnterWorkspaceFormProps = {
  branches: string[];
  workspaces: Workspace[];
  currentWorkspaceId: number | null | undefined;
  onEntered: (branch: string) => void;
  onCancel: () => void;
};

function EnterWorkspaceForm({
  branches,
  workspaces,
  currentWorkspaceId,
  onEntered,
  onCancel,
}: EnterWorkspaceFormProps) {
  const currentUser = useSelector(getUser);
  const [createBranch, createBranchResult] = useCreateBranchMutation();
  const [createWorkspace] = useCreateWorkspaceMutation();
  const [updateUser] = useUpdateUserMutation();
  const [sendToast] = useToast();

  const branchOptions = useMemo(() => {
    const set = new Set(branches);
    workspaces.forEach((workspace) => set.add(workspace.branch));
    return [...set];
  }, [branches, workspaces]);

  const initialBranch =
    workspaces.find((workspace) => workspace.id === currentWorkspaceId)
      ?.branch ?? null;

  const findWorkspace = (branch: string) =>
    workspaces.find((workspace) => workspace.branch === branch);

  const branchExists = (branch: string) => branchOptions.includes(branch);

  const getSubmitLabel = (branch: string | null) => {
    if (!branch || findWorkspace(branch)) {
      return t`Enter workspace`;
    }
    if (branchExists(branch)) {
      return t`Create workspace`;
    }
    return t`Create branch and workspace`;
  };

  const handleSubmit = async ({ branch }: WorkspaceBranchFormValues) => {
    if (!branch || !currentUser) {
      return;
    }
    try {
      if (!branchExists(branch)) {
        // Guard against re-creating the branch if a previous attempt created it but a later step failed.
        const alreadyCreated =
          createBranchResult.isSuccess &&
          createBranchResult.originalArgs?.name === branch;
        if (!alreadyCreated) {
          await createBranch({ name: branch }).unwrap();
        }
      }

      const workspace =
        findWorkspace(branch) ?? (await createWorkspace({ branch }).unwrap());

      await updateUser({
        id: currentUser.id,
        workspace_id: workspace.id,
      }).unwrap();

      onEntered(workspace.branch);
    } catch (error) {
      sendToast({
        icon: "warning",
        message: getErrorMessage(error, t`Failed to enter workspace`),
      });
    }
  };

  return (
    <WorkspaceBranchForm
      branches={branchOptions}
      initialBranch={initialBranch}
      validationSchema={VALIDATION_SCHEMA}
      getSubmitLabel={getSubmitLabel}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
