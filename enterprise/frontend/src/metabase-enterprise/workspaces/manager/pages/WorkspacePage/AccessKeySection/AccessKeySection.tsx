import { useClipboard } from "@mantine/hooks";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  TextInput,
  Tooltip,
} from "metabase/ui";
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
      description={t`Create an API key to be able to access workspace configuration without a user session.`}
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
  const clipboard = useClipboard({ timeout: 2000 });

  const handleCopy = () => {
    clipboard.copy(sharingKey);
  };

  const handleRegenerate = () => {
    show({
      title: t`Regenerate API key`,
      message: t`We will replace the existing API key with a new key. You won't be able to recover the old key.`,
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
      <Group p="md" gap="sm" wrap="nowrap" align="center">
        <TextInput value={sharingKey} readOnly maw="22.5rem" flex={1} />
        <Tooltip label={clipboard.copied ? t`Copied` : t`Copy`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Copy`}
            onClick={handleCopy}
          >
            <Icon name={clipboard.copied ? "check" : "copy"} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Regenerate API key`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Regenerate API key`}
            onClick={handleRegenerate}
          >
            <Icon name="pencil" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Delete API key`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Delete API key`}
            onClick={handleDelete}
          >
            <Icon name="trash" />
          </ActionIcon>
        </Tooltip>
      </Group>
      {modalContent}
    </>
  );
}
