import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

type ArchiveSnippetModalProps = {
  snippet: NativeQuerySnippet;
  onClose: () => void;
};

export function ArchiveSnippetModal(props: ArchiveSnippetModalProps) {
  const { snippet, onClose } = props;
  const { push } = useNavigation();
  const [updateSnippet, { isLoading }] = useUpdateSnippetMutation();
  const [sendToast] = useToast();

  const handleArchive = async () => {
    const { error } = await updateSnippet({
      id: snippet.id,
      archived: true,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to archive snippet`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: (
          <>
            {t`"${snippet.name}" archived.`}{" "}
            <Text
              c="inherit"
              component={Link}
              td="underline"
              to={Urls.dataStudioArchivedSnippets()}
            >
              {t`View archived snippets`}
            </Text>
          </>
        ),
        icon: "check",
      });
      push(Urls.dataStudioLibrary());
      onClose();
    }
  };

  return (
    <Modal opened onClose={onClose} title={t`Archive snippet?`}>
      <Stack>
        <Text>{t`Are you sure you want to archive "${snippet.name}"?`}</Text>
        <Group gap="sm" justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            color="error"
            loading={isLoading}
            onClick={handleArchive}
            variant="filled"
          >
            {t`Archive`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
