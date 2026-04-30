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
  useDeleteWorkspaceAccessKeyMutation,
  useSetWorkspaceAccessKeyMutation,
} from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace, WorkspaceId } from "metabase-types/api";

type AccessKeySectionProps = {
  workspace: Workspace;
};

export function AccessKeySection({ workspace }: AccessKeySectionProps) {
  return (
    <TitleSection
      label={t`Access key`}
      description={t`Create an access key to be able to download workspace configuration without a user session.`}
    >
      {workspace.access_key == null ? (
        <CreateAccessKeySection workspaceId={workspace.id} />
      ) : (
        <ManageAccessKeySection
          workspaceId={workspace.id}
          accessKey={workspace.access_key}
        />
      )}
    </TitleSection>
  );
}

type CreateAccessKeySectionProps = {
  workspaceId: WorkspaceId;
};

function CreateAccessKeySection({ workspaceId }: CreateAccessKeySectionProps) {
  const [setAccessKey, { isLoading }] = useSetWorkspaceAccessKeyMutation();

  const handleCreate = async () => {
    await setAccessKey(workspaceId).unwrap();
  };

  return (
    <Box p="md">
      <Button loading={isLoading} onClick={handleCreate}>
        {t`Create access key`}
      </Button>
    </Box>
  );
}

type ManageAccessKeySectionProps = {
  workspaceId: WorkspaceId;
  accessKey: string;
};

function ManageAccessKeySection({
  workspaceId,
  accessKey,
}: ManageAccessKeySectionProps) {
  const [setAccessKey] = useSetWorkspaceAccessKeyMutation();
  const [deleteAccessKey] = useDeleteWorkspaceAccessKeyMutation();
  const { modalContent, show } = useConfirmation();
  const clipboard = useClipboard({ timeout: 2000 });

  const handleCopy = () => {
    clipboard.copy(accessKey);
  };

  const handleRegenerate = () => {
    show({
      title: t`Regenerate access key`,
      message: t`We will replace the existing access key with a new key. You won't be able to recover the old key.`,
      confirmButtonText: t`Regenerate`,
      confirmButtonProps: { variant: "filled", color: "brand" },
      onConfirm: async () => {
        await setAccessKey(workspaceId).unwrap();
      },
    });
  };

  const handleDelete = () => {
    show({
      title: t`Delete access key`,
      message: t`You won't be able to recover a deleted access key. You'll have to create a new key.`,
      confirmButtonText: t`Delete access key`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteAccessKey(workspaceId).unwrap();
      },
    });
  };

  return (
    <>
      <Group p="md" gap="sm" wrap="nowrap" align="center">
        <TextInput value={accessKey} readOnly maw="22.5rem" flex={1} />
        <Tooltip label={clipboard.copied ? t`Copied` : t`Copy`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Copy`}
            onClick={handleCopy}
          >
            <Icon name={clipboard.copied ? "check" : "copy"} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Regenerate access key`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Regenerate access key`}
            onClick={handleRegenerate}
          >
            <Icon name="pencil" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Delete access key`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Delete access key`}
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
