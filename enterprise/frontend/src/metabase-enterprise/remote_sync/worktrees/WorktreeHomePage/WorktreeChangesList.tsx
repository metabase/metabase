import { Fragment, useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useGetIcon } from "metabase/hooks/use-icon";
import {
  Badge,
  Box,
  Divider,
  FixedSizeIcon,
  Group,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type {
  Collection,
  RemoteSyncEntity,
  WorktreeId,
} from "metabase-types/api";

import {
  type CollectionGroup,
  type TableGroup,
  getGroupIcon,
} from "../../displayGroups";
import { useCollectionGroups } from "../../hooks/use-collection-groups";
import { getSyncStatusBadgeColor, getSyncStatusLabel } from "../../utils";

import S from "./WorktreeChangesList.module.css";
import {
  type ChangeCounts,
  getEntityIcon,
  getWorktreeEntityUrl,
} from "./utils";

type WorktreeChangesListProps = {
  worktreeId: WorktreeId;
  branch: string;
  entities: RemoteSyncEntity[];
  counts: ChangeCounts;
  isLoading: boolean;
  error: unknown;
};

export function WorktreeChangesList({
  worktreeId,
  branch,
  entities,
  counts,
  isLoading,
  error,
}: WorktreeChangesListProps) {
  const {
    groups,
    collectionMap,
    isLoading: isLoadingGroups,
  } = useCollectionGroups(entities, { worktreeId });

  return (
    <TitleSection
      label={t`Changes to push`}
      description={t`Content in this worktree that differs from the ${branch} branch.`}
      actions={<ChangeCountBadges counts={counts} />}
      data-testid="worktree-changes"
    >
      {error != null ? (
        <LoadingAndErrorWrapper error={error} />
      ) : isLoading || isLoadingGroups ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : entities.length === 0 ? (
        <InSyncState branch={branch} />
      ) : (
        <Stack gap={0}>
          {groups.map((group, index) => (
            <Fragment key={`${group.collectionId ?? "root"}-${index}`}>
              {index > 0 && <Divider />}
              <ChangeGroup
                group={group}
                worktreeId={worktreeId}
                collectionMap={collectionMap}
              />
            </Fragment>
          ))}
        </Stack>
      )}
    </TitleSection>
  );
}

function ChangeCountBadges({ counts }: { counts: ChangeCounts }) {
  if (counts.added + counts.modified + counts.removed === 0) {
    return null;
  }
  return (
    <Group gap="xs" wrap="nowrap" data-testid="worktree-change-counts">
      {counts.added > 0 && (
        <Badge color="positive">{t`${counts.added} added`}</Badge>
      )}
      {counts.modified > 0 && (
        <Badge color="brand">{t`${counts.modified} modified`}</Badge>
      )}
      {counts.removed > 0 && (
        <Badge color="negative">{t`${counts.removed} removed`}</Badge>
      )}
    </Group>
  );
}

function InSyncState({ branch }: { branch: string }) {
  return (
    <Stack align="center" gap="sm" py="xxl" px="lg" ta="center">
      <Box className={S.inSyncIcon}>
        <FixedSizeIcon name="check" size={20} c="feedback-positive" />
      </Box>
      <Text fw="bold" fz="lg">{t`Everything is in sync`}</Text>
      <Text c="text-secondary" maw="32rem">
        {t`The content in this worktree matches the ${branch} branch. Edits you make here will show up as changes to push.`}
      </Text>
    </Stack>
  );
}

type ChangeGroupProps = {
  group: CollectionGroup;
  worktreeId: WorktreeId;
  collectionMap: Map<number, Collection>;
};

function ChangeGroup({ group, worktreeId, collectionMap }: ChangeGroupProps) {
  const path = group.pathSegments.map((segment) => segment.name).join(" / ");

  return (
    <Box data-testid="worktree-change-group">
      <Group
        gap="sm"
        wrap="nowrap"
        px="lg"
        py="sm"
        bg="background_page-secondary"
      >
        <FixedSizeIcon
          name={getGroupIcon(group.spec)}
          size={14}
          c="text-secondary"
        />
        <Text size="sm" fw="bold" c="text-secondary" truncate title={path}>
          {path}
        </Text>
        {group.collectionEntity && (
          <Box ml="auto">
            <StatusBadge entity={group.collectionEntity} />
          </Box>
        )}
      </Group>
      {group.tableGroups.map((tableGroup) => (
        <TableChangeRows
          key={tableGroup.tableId}
          tableGroup={tableGroup}
          worktreeId={worktreeId}
          collectionMap={collectionMap}
        />
      ))}
      {group.items.map((entity) => (
        <ChangeRow
          key={`${entity.model}-${entity.id}`}
          entity={entity}
          worktreeId={worktreeId}
          collectionMap={collectionMap}
        />
      ))}
    </Box>
  );
}

type TableChangeRowsProps = {
  tableGroup: TableGroup;
  worktreeId: WorktreeId;
  collectionMap: Map<number, Collection>;
};

function TableChangeRows({
  tableGroup,
  worktreeId,
  collectionMap,
}: TableChangeRowsProps) {
  return (
    <>
      {tableGroup.table ? (
        <ChangeRow
          entity={tableGroup.table}
          worktreeId={worktreeId}
          collectionMap={collectionMap}
        />
      ) : (
        <Group gap="sm" wrap="nowrap" px="lg" py="sm">
          <FixedSizeIcon name="table" c="text-secondary" />
          <Text c="text-secondary">{tableGroup.tableName}</Text>
        </Group>
      )}
      {tableGroup.children.map((child) => (
        <ChangeRow
          key={`${child.model}-${child.id}`}
          entity={child}
          worktreeId={worktreeId}
          collectionMap={collectionMap}
          isNested
        />
      ))}
    </>
  );
}

type ChangeRowProps = {
  entity: RemoteSyncEntity;
  worktreeId: WorktreeId;
  collectionMap: Map<number, Collection>;
  isNested?: boolean;
};

function ChangeRow({
  entity,
  worktreeId,
  collectionMap,
  isNested,
}: ChangeRowProps) {
  const getIcon = useGetIcon();
  const iconName = useMemo(
    () => getEntityIcon(entity, getIcon),
    [entity, getIcon],
  );
  const url = useMemo(
    () => getWorktreeEntityUrl(entity, worktreeId, collectionMap),
    [entity, worktreeId, collectionMap],
  );
  const isRemoved =
    entity.sync_status === "delete" || entity.sync_status === "removed";
  // A removed entity has no page left to open.
  const href = isRemoved ? null : url;

  const content = (
    <Group gap="sm" wrap="nowrap" flex={1} miw={0}>
      <FixedSizeIcon name={iconName} c="text-secondary" className={S.rowIcon} />
      <Text truncate title={entity.name} className={S.rowName}>
        {entity.name}
      </Text>
    </Group>
  );

  return (
    <Group
      gap="md"
      wrap="nowrap"
      px="lg"
      py="sm"
      pl={isNested ? "3rem" : "lg"}
      className={S.row}
      data-testid="worktree-change-row"
    >
      {href ? (
        <Link to={href} className={S.rowLink}>
          {content}
        </Link>
      ) : (
        content
      )}
      <StatusBadge entity={entity} />
    </Group>
  );
}

function StatusBadge({ entity }: { entity: RemoteSyncEntity }) {
  return (
    <Badge color={getSyncStatusBadgeColor(entity.sync_status)}>
      {getSyncStatusLabel(entity.sync_status)}
    </Badge>
  );
}
