import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Button, Center, Group, Stack, Text, Title } from "metabase/ui";
import { GitSettingsModal } from "metabase-enterprise/remote_sync/components/GitSettingsModal";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

export function RemoteSyncSetupState() {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <Center h="100%">
      <Stack align="center" gap="md" maw="30rem" ta="center">
        <Title order={2}>{t`Connect a repository to get started`}</Title>
        <Text c="text-secondary">
          {t`Content Studio manages the collections, transforms, and snippets you keep in git. Set up remote sync to see them here.`}
        </Text>
        <Group gap="sm">
          <Button variant="filled" onClick={openModal}>
            {t`Set up remote sync`}
          </Button>
          <Button
            component={Link}
            to={REMOTE_SYNC_SETTINGS_PATH}
            variant="default"
          >
            {t`Go to remote sync settings`}
          </Button>
        </Group>
      </Stack>
      <GitSettingsModal isOpen={isModalOpen} onClose={closeModal} />
    </Center>
  );
}
