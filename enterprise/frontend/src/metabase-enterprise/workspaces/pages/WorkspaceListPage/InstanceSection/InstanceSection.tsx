import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Button,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { CreateInstanceModal } from "./CreateInstanceModal";
import { InstanceItem } from "./InstanceItem";

export type InstanceSectionProps = {
  instances: WorkspaceInstance[];
};

export function InstanceSection({ instances }: InstanceSectionProps) {
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const hasInstances = instances.length > 0;

  return (
    <Stack data-testid="instance-list" gap="lg">
      <Group justify="space-between">
        <Title order={4}>{t`Developer instances`}</Title>
        {hasInstances && (
          <Button
            leftSection={<FixedSizeIcon name="add" aria-hidden />}
            onClick={openCreate}
          >
            {t`Add`}
          </Button>
        )}
      </Group>
      {hasInstances ? (
        instances.map((instance) => (
          <InstanceItem key={instance.id} instance={instance} />
        ))
      ) : (
        <InstanceSectionEmptyState onAdd={openCreate} />
      )}
      <CreateInstanceModal
        opened={isCreateOpen}
        onCreate={closeCreate}
        onClose={closeCreate}
      />
    </Stack>
  );
}

type InstanceSectionEmptyStateProps = {
  onAdd: () => void;
};

function InstanceSectionEmptyState({ onAdd }: InstanceSectionEmptyStateProps) {
  const applicationName = useSelector(getApplicationName);

  return (
    <Card p="xl" shadow="none" withBorder>
      <Stack p="sm" align="center">
        <Text c="text-secondary" ta="center" maw="25rem">
          {t`A developer instance is a separate ${applicationName} instance where you can safely view and modify the content of a workspace.`}
        </Text>
        <Button variant="filled" onClick={onAdd}>
          {t`Add a development instance`}
        </Button>
      </Stack>
    </Card>
  );
}
