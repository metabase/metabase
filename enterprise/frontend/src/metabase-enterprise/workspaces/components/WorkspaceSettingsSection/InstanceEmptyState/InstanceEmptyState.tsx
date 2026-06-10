import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Box, Button, Card, Text, Title } from "metabase/ui";

import { CreateInstanceModal } from "../CreateInstanceModal";

export function InstanceEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Card
        data-testid="workspace-instance-empty-state"
        p="xl"
        maw="40rem"
        mx="auto"
        shadow="none"
        withBorder
      >
        <Box p="md">
          <Title
            order={3}
            mb="sm"
          >{t`Develop content in an isolated instance`}</Title>
          <Text mb="lg">
            {t`Register a development instance to iterate on content in isolation — for example, building with the CLI and previewing changes — before syncing them back to production.`}
          </Text>
          <Button variant="filled" onClick={open}>
            {t`Add a development instance`}
          </Button>
        </Box>
      </Card>
      <CreateInstanceModal opened={opened} onCreate={close} onClose={close} />
    </>
  );
}
