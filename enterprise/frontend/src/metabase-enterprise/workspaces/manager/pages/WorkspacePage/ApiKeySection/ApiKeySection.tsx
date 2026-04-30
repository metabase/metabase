import { t } from "ttag";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Box, Button, Divider, Group, Stack } from "metabase/ui";
import {
  useDeleteWorkspaceSharingKeyMutation,
  useSetWorkspaceSharingKeyMutation,
} from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace, WorkspaceId } from "metabase-types/api";

type ApiKeySectionProps = {
  workspace: Workspace;
};

export function ApiKeySection({ workspace }: ApiKeySectionProps) {
  return (
    <TitleSection
      label={t`API key`}
      description={t`Create an API key for coding agents to be able to access this workspace.`}
    >
      {workspace.sharing_key == null ? (
        <CreateApiKeySection workspaceId={workspace.id} />
      ) : (
        <ManageApiKeySection
          workspaceId={workspace.id}
          sharingKey={workspace.sharing_key}
        />
      )}
    </TitleSection>
  );
}

type CreateApiKeySectionProps = {
  workspaceId: WorkspaceId;
};

function CreateApiKeySection({ workspaceId }: CreateApiKeySectionProps) {
  const [setSharingKey, { isLoading }] = useSetWorkspaceSharingKeyMutation();

  const handleCreate = async () => {
    await setSharingKey(workspaceId).unwrap();
  };

  return (
    <Box p="md">
      <Button variant="filled" loading={isLoading} onClick={handleCreate}>
        {t`Create API key`}
      </Button>
    </Box>
  );
}

type ManageApiKeySectionProps = {
  workspaceId: WorkspaceId;
  sharingKey: string;
};

function ManageApiKeySection({
  workspaceId,
  sharingKey,
}: ManageApiKeySectionProps) {
  const [setSharingKey] = useSetWorkspaceSharingKeyMutation();
  const [deleteSharingKey] = useDeleteWorkspaceSharingKeyMutation();
  const { modalContent, show } = useConfirmation();

  const handleRegenerate = () => {
    show({
      title: t`Regenerate API key`,
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only workspace management UI
      message: t`Metabase will replace the existing API key with a new key. You won't be able to recover the old key.`,
      confirmButtonText: t`Regenerate`,
      confirmButtonProps: { variant: "filled", color: "brand" },
      onConfirm: async () => {
        await setSharingKey(workspaceId).unwrap();
      },
    });
  };

  const handleDelete = () => {
    show({
      title: t`Delete API key`,
      message: t`You won't be able to recover a deleted API key. You'll have to create a new key.`,
      confirmButtonText: t`Delete API key`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteSharingKey(workspaceId).unwrap();
      },
    });
  };

  return (
    <>
      <Stack p="md" gap="sm">
        <CopyTextInput value={sharingKey} readOnly maw="22.5rem" />
      </Stack>
      <Divider />
      <Stack p="md" gap="sm">
        <Group>
          <Button onClick={handleRegenerate}>{t`Regenerate API key`}</Button>
          <Button onClick={handleDelete}>{t`Delete API key`}</Button>
        </Group>
      </Stack>
      {modalContent}
    </>
  );
}
