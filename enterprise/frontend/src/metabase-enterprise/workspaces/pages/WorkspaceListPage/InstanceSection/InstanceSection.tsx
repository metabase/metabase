import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Group, Icon, Stack, Title } from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { CreateInstanceModal } from "../CreateInstanceModal";

import { InstanceItem } from "./InstanceItem";

type InstanceSectionProps = {
  instances: WorkspaceInstance[];
};

export function InstanceSection({ instances }: InstanceSectionProps) {
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>{t`Developer instances`}</Title>
        <Button leftSection={<Icon name="add" />} onClick={openCreateModal}>
          {t`Add`}
        </Button>
      </Group>
      <Stack>
        {instances.map((instance) => (
          <InstanceItem key={instance.id} instance={instance} />
        ))}
      </Stack>
      <CreateInstanceModal
        opened={createModalOpened}
        onClose={closeCreateModal}
        onCreate={closeCreateModal}
      />
    </Stack>
  );
}
