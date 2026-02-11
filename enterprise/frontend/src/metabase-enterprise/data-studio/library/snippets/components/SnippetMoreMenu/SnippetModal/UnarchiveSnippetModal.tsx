import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

type ArchiveSnippetModalProps = {
  snippet: Pick<NativeQuerySnippet, "id" | "name">;
  onClose: () => void;
};

export function UnarchiveSnippetModal(props: ArchiveSnippetModalProps) {
  const { snippet, onClose } = props;
  const [updateSnippet, { isLoading }] = useUpdateSnippetMutation();
  const [sendToast] = useToast();

  const handleUnarchive = async () => {
    const { error } = await updateSnippet({
      id: snippet.id,
      archived: false,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to unarchive snippet`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`"${snippet.name}" unarchived`,
        icon: "check",
      });
      onClose();
    }
  };

  return (
    <Modal opened onClose={onClose} title={t`Unarchive snippet?`}>
      <Stack>
        <Text>{t`Are you sure you want to unarchive "${snippet.name}"?`}</Text>
        <Group gap="sm" justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            onClick={handleUnarchive}
            loading={isLoading}
          >
            {t`Unarchive`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
