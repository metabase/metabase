import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Card, Stack, Text, Title } from "metabase/ui";

import { CreateInstanceModal } from "../CreateInstanceModal";

export function InstanceEmptyState() {
  const applicationName = useSelector(getApplicationName);
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  return (
    <Card p="xl" maw="40rem" shadow="none" withBorder>
      <Stack p="sm">
        <Title
          order={3}
        >{t`Use Workspaces to develop your semantic layer safely`}</Title>
        <Text c="text-secondary">
          {t`While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema, letting you test and build on top of these tables. When you're ready, use remote sync to pull your changes into your production ${applicationName}.`}
        </Text>
        <Text c="text-secondary">
          {t`First, you'll need to set up a development instance, then create a workspace.`}
        </Text>
        <Box>
          <Button variant="filled" onClick={openCreateModal}>
            {t`Add a development instance`}
          </Button>
        </Box>
      </Stack>
      <CreateInstanceModal
        opened={createModalOpened}
        onClose={closeCreateModal}
        onCreate={closeCreateModal}
      />
    </Card>
  );
}
