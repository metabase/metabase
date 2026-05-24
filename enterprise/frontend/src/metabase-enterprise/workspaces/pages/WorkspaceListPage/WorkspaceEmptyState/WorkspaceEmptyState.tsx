import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { jt, t } from "ttag";

import { useDispatch } from "metabase/redux";
import {
  Box,
  Button,
  Card,
  Code,
  Divider,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { NewWorkspaceModal } from "../NewWorkspaceModal";
import { SetupWorkspaceModal } from "../SetupWorkspaceModal";

const CONFIG_FILENAME = "config.yml";

export function WorkspaceEmptyState() {
  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [setupOpened, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);
  const dispatch = useDispatch();

  const handleCreate = (workspace: Workspace) => {
    closeCreate();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <Card p="xl" maw="56rem" mx="auto" shadow="none" withBorder>
      <Stack p="md" gap="xl">
        <Section
          title={t`Isolated spaces for agents and developers`}
          description={t`Develop and run transforms, and build your semantic layer without touching your production tables.`}
        />
        <Divider />
        <SimpleGrid cols={2} spacing="xl">
          <Section
            title={t`Is this your main instance?`}
            description={t`Create a workspace from here. We will provision an isolated schema and a dedicated user in the databases you pick, ready for a developer instance to use.`}
          >
            <Button variant="filled" onClick={openCreate}>
              {t`Create a workspace`}
            </Button>
          </Section>
          <Section
            title={t`Or is this your developer instance?`}
            description={jt`Upload the ${(
              <Code key="config">{CONFIG_FILENAME}</Code>
            )} from your main instance. We will register its databases and load the workspace here, switching into workspace mode.`}
          >
            <Button variant="default" onClick={openSetup}>
              {t`Set up a developer instance`}
            </Button>
          </Section>
        </SimpleGrid>
      </Stack>
      <NewWorkspaceModal
        opened={createOpened}
        onCreate={handleCreate}
        onClose={closeCreate}
      />
      <SetupWorkspaceModal opened={setupOpened} onClose={closeSetup} />
    </Card>
  );
}

type SectionProps = {
  title: string;
  description: ReactNode;
  children?: ReactNode;
};

function Section({ title, description, children }: SectionProps) {
  return (
    <Stack gap="sm" align="flex-start" h="100%">
      <Title order={4}>{title}</Title>
      <Text c="text-secondary" flex={1}>
        {description}
      </Text>
      {children && <Box pt="xs">{children}</Box>}
    </Stack>
  );
}
