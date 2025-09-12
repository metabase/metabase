import { t } from "ttag";

import {
  Anchor,
  Box,
  Divider,
  Flex,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { UnsyncedEntity } from "metabase-enterprise/api";

const MODEL_NAMES = {
  collection: () => t`Collections`,
  card: () => t`Questions`,
  dashboard: () => t`Dashboards`,
  snippet: () => t`Snippets`,
  timeline: () => t`Timelines`,
  document: () => t`Documents`,
};

function getEntityUrl(entity: UnsyncedEntity): string | null {
  switch (entity.model) {
    case "collection":
      return `/collection/${entity.id}`;
    case "card":
      return `/question/${entity.id}`;
    case "dashboard":
      return `/dashboard/${entity.id}`;
    case "document":
      return `/document/${entity.id}`;
    default:
      return null;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

interface EntityItemProps {
  entity: UnsyncedEntity;
}

function EntityItem({ entity }: EntityItemProps) {
  const url = getEntityUrl(entity);
  const lastModified = entity.updated_at || entity.created_at;

  return (
    <Box
      p="md"
      style={{
        borderRadius: "8px",
        backgroundColor: "var(--mb-color-bg-light)",
        border: "1px solid var(--mb-color-border)",
      }}
    >
      <Flex justify="space-between" align="flex-start" gap="md">
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Anchor
            href={url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            fw="bold"
            c="text"
            style={{
              textDecoration: "none",
              wordBreak: "break-word",
            }}
            onClick={(e) => {
              if (url) {
                e.preventDefault();
                window.open(url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            {entity.name}
          </Anchor>
          {entity.description && (
            <Text size="sm" c="text-medium" lineClamp={2}>
              {entity.description}
            </Text>
          )}
        </Stack>
        <Text size="xs" c="text-light" style={{ whiteSpace: "nowrap" }}>
          {formatDate(lastModified)}
        </Text>
      </Flex>
    </Box>
  );
}

interface EntityGroupProps {
  model: UnsyncedEntity["model"];
  entities: UnsyncedEntity[];
}

function EntityGroup({ model, entities }: EntityGroupProps) {
  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Title order={4}>{MODEL_NAMES[model]()}</Title>
        <Text c="text-medium" size="sm">
          ({entities.length})
        </Text>
      </Group>
      <Stack gap="sm">
        {entities.map((entity) => (
          <EntityItem key={`${entity.model}-${entity.id}`} entity={entity} />
        ))}
      </Stack>
    </Stack>
  );
}

interface UnsyncedChangesModalProps {
  opened: boolean;
  onClose: () => void;
  entities: UnsyncedEntity[];
  totalCount: number;
}

export function UnsyncedChangesModal({
  opened,
  onClose,
  entities,
  totalCount,
}: UnsyncedChangesModalProps) {
  const groupedEntities = entities.reduce(
    (acc, entity) => {
      if (!acc[entity.model]) {
        acc[entity.model] = [];
      }
      acc[entity.model].push(entity);
      return acc;
    },
    {} as Record<UnsyncedEntity["model"], UnsyncedEntity[]>,
  );

  const sortedGroups = Object.entries(groupedEntities).sort(([a], [b]) =>
    MODEL_NAMES[a as UnsyncedEntity["model"]]().localeCompare(
      MODEL_NAMES[b as UnsyncedEntity["model"]](),
    ),
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Unsynced Changes`}
      size="lg"
    >
      <Stack gap="lg">
        <Text c="text-medium">
          {t`${totalCount} items have been modified since the last sync and will be overwritten during import.`}
        </Text>

        <Stack gap="xl">
          {sortedGroups.map(([model, modelEntities], index) => (
            <Box key={model}>
              <EntityGroup
                model={model as UnsyncedEntity["model"]}
                entities={modelEntities}
              />
              {index < sortedGroups.length - 1 && <Divider mt="lg" />}
            </Box>
          ))}
        </Stack>
      </Stack>
    </Modal>
  );
}
