import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

type DeleteSnippetModalProps = {
  snippet: NativeQuerySnippet;
  onDelete?: () => void;
  onClose: () => void;
};

export function DeleteSnippetModal({
  snippet,
  onDelete,
  onClose,
}: DeleteSnippetModalProps) {
  const [updateSnippet, { isLoading }] = useUpdateSnippetMutation();
  const [sendToast] = useToast();

  const handleDelete = async () => {
    const { error } = await updateSnippet({
      id: snippet.id,
      archived: true,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to delete snippet`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`Snippet deleted`,
        icon: "check",
      });
      onDelete?.();
      onClose();
    }
  };

  return (
    <Modal opened onClose={onClose} title={t`Delete snippet?`}>
      <Stack>
        <Text>
          {t`Are you sure you want to delete "${snippet.name}"? This action cannot be undone.`}
        </Text>
        <Group gap="sm" justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            color="error"
            onClick={handleDelete}
            loading={isLoading}
          >
            {t`Delete`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
