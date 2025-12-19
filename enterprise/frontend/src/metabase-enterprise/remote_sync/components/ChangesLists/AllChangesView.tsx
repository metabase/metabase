import { Fragment, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Divider,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  buildCollectionMap,
  getCollectionPathSegments,
  getSyncStatusColor,
  getSyncStatusIcon,
  isTableChildModel,
} from "metabase-enterprise/remote_sync/utils";
import type { RemoteSyncEntity } from "metabase-types/api";

import { CollectionPath } from "./CollectionPath";
import { EntityLink } from "./EntityLink";

/** A table entity with its nested children (fields and segments) */
type TableWithChildren = {
  table: RemoteSyncEntity;
  children: RemoteSyncEntity[];
};

/** A virtual table group for orphan children (when the table itself isn't dirty) */
type OrphanTableGroup = {
  tableId: number;
  tableName: string;
  children: RemoteSyncEntity[];
};

const SYNC_STATUS_ORDER: RemoteSyncEntity["sync_status"][] = [
  "create",
  "update",
  "touch",
  "delete",
];

interface AllChangesViewProps {
  entities: RemoteSyncEntity[];
  title?: string;
}

export const AllChangesView = ({ entities, title }: AllChangesViewProps) => {
  const isUsingTenants = useSetting("use-tenants");
  const { data: collectionTree = [] } = useListCollectionsTreeQuery({
    namespaces: [
      "",
      "analytics",
      ...(isUsingTenants ? ["shared-tenant-collection"] : []),
    ],
    "include-library": true,
  });

  const collectionMap = useMemo(() => {
    return buildCollectionMap(collectionTree);
  }, [collectionTree]);

  const hasRemovals = useMemo(() => {
    return (
      entities.findIndex((e) =>
        ["removed", "delete"].includes(e.sync_status),
      ) >= 0
    );
  }, [entities]);

  const groupedData = useMemo(() => {
    const byCollection = _.groupBy(entities, (e) => e.collection_id || 0);

    const sortByStatus = (items: RemoteSyncEntity[]) =>
      items.sort((a, b) => {
        const statusOrderA = SYNC_STATUS_ORDER.indexOf(a.sync_status);
        const statusOrderB = SYNC_STATUS_ORDER.indexOf(b.sync_status);
        if (statusOrderA !== statusOrderB) {
          return statusOrderA - statusOrderB;
        }
        return a.name.localeCompare(b.name);
      });

    return Object.entries(byCollection)
      .map(([collectionId, items]) => {
        const collectionEntity = items.find(
          (item) =>
            item.model === "collection" && item.id === Number(collectionId),
        );

        // Separate tables, table children, and other items
        const tables = items.filter((item) => item.model === "table");
        const tableChildren = items.filter((item) =>
          isTableChildModel(item.model),
        );
        const otherItems = items.filter(
          (item) =>
            item.model !== "table" &&
            !isTableChildModel(item.model) &&
            !(item.model === "collection" && item.id === Number(collectionId)),
        );

        // Group table children by their parent table_id
        const childrenByTableId = _.groupBy(
          tableChildren,
          (e) => e.table_id || 0,
        );

        // Create table items with their nested children
        const tablesWithChildren: TableWithChildren[] = tables.map((table) => ({
          table,
          children: sortByStatus(childrenByTableId[table.id] || []),
        }));

        // Find orphan children (children whose parent table is not in the dirty set)
        const tableIds = new Set(tables.map((t) => t.id));
        const orphanTableGroups: OrphanTableGroup[] = Object.entries(
          childrenByTableId,
        )
          .filter(([tableId]) => !tableIds.has(Number(tableId)))
          .map(([tableId, children]) => ({
            tableId: Number(tableId),
            tableName: children[0]?.table_name ?? t`Unknown table`,
            children: sortByStatus(children),
          }));

        return {
          pathSegments: getCollectionPathSegments(
            Number(collectionId) || undefined,
            collectionMap,
          ),
          collectionId: Number(collectionId) || undefined,
          collectionEntity,
          tablesWithChildren: tablesWithChildren.sort((a, b) =>
            a.table.name.localeCompare(b.table.name),
          ),
          orphanTableGroups: orphanTableGroups.sort((a, b) =>
            a.tableName.localeCompare(b.tableName),
          ),
          items: sortByStatus(otherItems),
        };
      })
      .sort((a, b) =>
        a.pathSegments
          .map((s) => s.name)
          .join(" / ")
          .localeCompare(b.pathSegments.map((s) => s.name).join(" / ")),
      );
  }, [entities, collectionMap]);

  return (
    <Box>
      {!!title && (
        <Title order={4} mb="md" c="text-secondary">
          {title}
        </Title>
      )}

      <Paper
        withBorder
        radius="md"
        mah={400}
        styles={{
          root: {
            overflowY: "auto",
          },
        }}
      >
        <Stack gap={0}>
          {groupedData.map((group, groupIndex) => {
            const hasItems =
              group.items.length > 0 ||
              group.tablesWithChildren.length > 0 ||
              group.orphanTableGroups.length > 0;

            return (
              <Fragment key={group.collectionId}>
                {groupIndex > 0 && <Divider />}
                <Box p="md">
                  <Group
                    p="sm"
                    gap="sm"
                    mb={hasItems ? "0.75rem" : 0}
                    bg="bg-light"
                    bdrs="md"
                  >
                    <Icon
                      name="synced_collection"
                      size={16}
                      c="text-secondary"
                    />
                    <CollectionPath segments={group.pathSegments} />
                    {group.collectionEntity && (
                      <Icon
                        name={getSyncStatusIcon(
                          group.collectionEntity.sync_status,
                        )}
                        size={16}
                        c={getSyncStatusColor(
                          group.collectionEntity.sync_status,
                        )}
                        ml="auto"
                      />
                    )}
                  </Group>
                  {hasItems && (
                    <Stack
                      gap="0.75rem"
                      ml="md"
                      pl="xs"
                      style={{
                        borderLeft: "2px solid var(--mb-color-border)",
                      }}
                    >
                      {/* Render tables with their children */}
                      {group.tablesWithChildren.map(({ table, children }) => (
                        <Box key={`table-${table.id}`}>
                          <EntityLink entity={table} />
                          {children.length > 0 && (
                            <Stack
                              gap="0.75rem"
                              ml="md"
                              pl="xs"
                              mt="0.75rem"
                              style={{
                                borderLeft:
                                  "2px solid var(--mb-color-border-light)",
                              }}
                            >
                              {children.map((child) => (
                                <EntityLink
                                  key={`${child.model}-${child.id}`}
                                  entity={child}
                                />
                              ))}
                            </Stack>
                          )}
                        </Box>
                      ))}

                      {/* Render orphan table groups (children without their parent table in dirty set) */}
                      {group.orphanTableGroups.map((orphanGroup) => (
                        <Box key={`orphan-table-${orphanGroup.tableId}`}>
                          <Group gap="sm" wrap="nowrap" px="sm">
                            <Icon name="table" size={16} c="text-secondary" />
                            <Text size="sm" c="text-secondary">
                              {orphanGroup.tableName}
                            </Text>
                          </Group>
                          <Stack
                            gap="0.75rem"
                            ml="md"
                            pl="xs"
                            mt="0.75rem"
                            style={{
                              borderLeft:
                                "2px solid var(--mb-color-border-light)",
                            }}
                          >
                            {orphanGroup.children.map((child) => (
                              <EntityLink
                                key={`${child.model}-${child.id}`}
                                entity={child}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ))}

                      {/* Render other non-table items */}
                      {group.items.map((entity) => (
                        <EntityLink
                          key={`${entity.model}-${entity.id}`}
                          entity={entity}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              </Fragment>
            );
          })}
        </Stack>
      </Paper>
      {hasRemovals && (
        <Text
          c="error"
          fz="sm"
          lh="sm"
          mt="sm"
        >{t`Other instances using this library may have items that depend on the items you're removing.`}</Text>
      )}
    </Box>
  );
};
