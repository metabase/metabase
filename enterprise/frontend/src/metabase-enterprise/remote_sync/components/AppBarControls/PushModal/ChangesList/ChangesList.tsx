import { Fragment, type ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/router";
import {
  Anchor,
  Box,
  Divider,
  Group,
  Icon,
  Paper,
  Stack,
  type StackProps,
  Text,
} from "metabase/ui";
import type { RemoteSyncDirtyItem } from "metabase-types/api";

import { getItemUrl, getModelIcon } from "../../../../utils";

import {
  type ChangesGroup,
  type ChangesItem,
  getStatusColor,
  getStatusIcon,
  groupChanges,
} from "./utils";

type ChangesListProps = {
  entities: RemoteSyncDirtyItem[];
};

export function ChangesList({ entities }: ChangesListProps) {
  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Changes`}</Text>
      <Paper withBorder radius="sm" mah="20rem" style={{ overflowY: "auto" }}>
        {groupChanges(entities).map((group, index) => (
          <Fragment key={group.key}>
            {index > 0 && <Divider />}
            <GroupSection group={group} />
          </Fragment>
        ))}
      </Paper>
    </Stack>
  );
}

type GroupSectionProps = {
  group: ChangesGroup;
};

function GroupSection({ group }: GroupSectionProps) {
  return (
    <Box p="md">
      <Group
        p="sm"
        gap="sm"
        mb={group.items.length > 0 ? "sm" : 0}
        bg="background_page-secondary"
        bdrs="sm"
        wrap="nowrap"
      >
        <Icon name={group.icon} c="text-secondary" />
        <Text fw="bold" c="text-secondary" truncate>
          {group.path.join(" / ")}
        </Text>
        {group.collectionEntity && (
          <StatusIcon entity={group.collectionEntity} />
        )}
      </Group>
      {group.items.length > 0 && (
        <NestedList>
          {group.items.map((item) => (
            <ItemSection key={item.key} item={item} />
          ))}
        </NestedList>
      )}
    </Box>
  );
}

type ItemSectionProps = {
  item: ChangesItem;
};

function ItemSection({ item }: ItemSectionProps) {
  return (
    <Box>
      {item.entity ? (
        <EntityRow entity={item.entity} />
      ) : (
        <Group gap="sm" wrap="nowrap">
          <Icon name="table" c="text-secondary" />
          <Text c="text-secondary" truncate>
            {item.name}
          </Text>
        </Group>
      )}
      {item.children.length > 0 && (
        <NestedList mt="sm">
          {item.children.map((child, index) => (
            <EntityRow
              key={`${child.model}-${child.id}-${index}`}
              entity={child}
            />
          ))}
        </NestedList>
      )}
    </Box>
  );
}

type EntityProps = {
  entity: RemoteSyncDirtyItem;
};

function EntityRow({ entity }: EntityProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Icon name={getModelIcon(entity.model)} c="text-secondary" />
      <EntityName entity={entity} />
      <StatusIcon entity={entity} />
    </Group>
  );
}

function EntityName({ entity }: EntityProps) {
  const url = getItemUrl(entity);

  return url != null ? (
    <Anchor component={Link} to={url} target="_blank" truncate>
      {entity.name}
    </Anchor>
  ) : (
    <Text truncate>{entity.name}</Text>
  );
}

function StatusIcon({ entity }: EntityProps) {
  return (
    <Icon
      name={getStatusIcon(entity.sync_status)}
      c={getStatusColor(entity.sync_status)}
      ml="auto"
      aria-label={entity.sync_status}
    />
  );
}

type NestedListProps = {
  mt?: StackProps["mt"];
  children: ReactNode;
};

function NestedList({ mt, children }: NestedListProps) {
  return (
    <Stack
      gap="sm"
      mt={mt}
      ml="lg"
      pl="sm"
      style={{ borderLeft: "2px solid var(--mb-color-border-neutral)" }}
    >
      {children}
    </Stack>
  );
}
