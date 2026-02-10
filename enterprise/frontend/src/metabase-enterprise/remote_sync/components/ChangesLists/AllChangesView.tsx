import { Fragment, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
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
import type { Collection, RemoteSyncEntity } from "metabase-types/api";

import { CollectionPath } from "./CollectionPath";
import { EntityLink } from "./EntityLink";

/** A table group with optional entity (when table itself is dirty) and its nested children */
type TableGroup = {
  tableId: number;
  tableName: string;
  table?: RemoteSyncEntity;
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
  const isTransformsSyncEnabled = useSetting("remote-sync-transforms");
  const { data: collectionTree = [] } = useListCollectionsTreeQuery({
    namespaces: [
      "",
      "analytics",
      ...(isUsingTenants ? ["shared-tenant-collection"] : []),
      ...(isTransformsSyncEnabled ? ["transforms"] : []),
    ],
    "include-library": true,
  });

  // Fetch snippets namespace collections separately
  const { data: snippetCollectionTree = [] } = useListCollectionsTreeQuery({
    namespace: "snippets",
  });

  // Build a set of snippet collection IDs for icon selection
  // Only include collections with namespace "snippets" to avoid false positives
  const snippetCollectionIds = useMemo(() => {
    const ids = new Set<number>();
    const collectIds = (collections: typeof snippetCollectionTree) => {
      for (const collection of collections) {
        if (
          typeof collection.id === "number" &&
          collection.namespace === "snippets"
        ) {
          ids.add(collection.id);
        }
        if (collection.children) {
          collectIds(collection.children);
        }
      }
    };
    collectIds(snippetCollectionTree);
    return ids;
  }, [snippetCollectionTree]);

  // Find the library collection ID for placing snippets without a collection_id
  const libraryCollectionId = useMemo(() => {
    const findLibrary = (collections: Collection[]): number | null => {
      for (const col of collections) {
        if (isLibraryCollection(col)) {
          return typeof col.id === "number" ? col.id : null;
        }
        if (col.children?.length) {
          const found = findLibrary(col.children);
          if (found !== null) {
            return found;
          }
        }
      }
      return null;
    };
    return findLibrary(collectionTree);
  }, [collectionTree]);

  const collectionMap = useMemo(() => {
    // Merge regular collections with snippet collections
    return buildCollectionMap([...collectionTree, ...snippetCollectionTree]);
  }, [collectionTree, snippetCollectionTree]);

  const hasRemovals = useMemo(() => {
    return (
      entities.findIndex((e) =>
        ["removed", "delete"].includes(e.sync_status),
      ) >= 0
    );
  }, [entities]);

  const groupedData = useMemo(() => {
    const byCollection = _.groupBy(entities, (e) => {
      if (e.collection_id != null) {
        return e.collection_id;
      }
      // Snippets without a collection_id should go under the Library collection
      if (e.model === "nativequerysnippet" && libraryCollectionId != null) {
        return libraryCollectionId;
      }
      // Default to Root for other entities without a collection_id
      return 0;
    });

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

        // Create table groups for dirty tables
        const tableIds = new Set(tables.map((t) => t.id));
        const dirtyTableGroups: TableGroup[] = tables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          table,
          children: sortByStatus(childrenByTableId[table.id] || []),
        }));

        // Create table groups for orphan children (children whose parent table is not dirty)
        const orphanTableGroups: TableGroup[] = Object.entries(
          childrenByTableId,
        )
          .filter(([tableId]) => !tableIds.has(Number(tableId)))
          .map(([tableId, children]) => ({
            tableId: Number(tableId),
            tableName: children[0]?.table_name ?? t`Unknown table`,
            children: sortByStatus(children),
          }));

        // Combine and sort all table groups
        const tableGroups = [...dirtyTableGroups, ...orphanTableGroups].sort(
          (a, b) => a.tableName.localeCompare(b.tableName),
        );

        const numericCollectionId = Number(collectionId) || undefined;
        const isSnippetCollection =
          numericCollectionId !== undefined &&
          snippetCollectionIds.has(numericCollectionId);

        // Get base path segments for this collection
        let pathSegments = getCollectionPathSegments(
          numericCollectionId,
          collectionMap,
        );

        // For snippet collections, prepend the Library collection path
        // This makes them appear as descendants of the Library collection
        if (isSnippetCollection && libraryCollectionId != null) {
          const libraryCollection = collectionMap.get(libraryCollectionId);
          if (libraryCollection) {
            pathSegments = [
              { id: libraryCollection.id, name: libraryCollection.name },
              ...pathSegments,
            ];
          }
        }

        return {
          pathSegments,
          collectionId: numericCollectionId,
          collectionEntity,
          tableGroups,
          items: sortByStatus(otherItems),
          isSnippetCollection,
        };
      })
      .sort((a, b) =>
        a.pathSegments
          .map((s) => s.name)
          .join(" / ")
          .localeCompare(b.pathSegments.map((s) => s.name).join(" / ")),
      );
  }, [entities, collectionMap, snippetCollectionIds, libraryCollectionId]);

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
              group.items.length > 0 || group.tableGroups.length > 0;

            return (
              <Fragment key={group.collectionId}>
                {groupIndex > 0 && <Divider />}
                <Box p="md">
                  <Group
                    p="sm"
                    gap="sm"
                    mb={hasItems ? "0.75rem" : 0}
                    bg="background-secondary"
                    bdrs="md"
                  >
                    <Icon
                      name={
                        group.isSnippetCollection
                          ? "snippet"
                          : "synced_collection"
                      }
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
                      {/* Render table groups (both dirty tables and orphan children) */}
                      {group.tableGroups.map((tableGroup) => (
                        <Box key={`table-${tableGroup.tableId}`}>
                          {tableGroup.table ? (
                            <EntityLink entity={tableGroup.table} />
                          ) : (
                            <Group gap="sm" wrap="nowrap" px="sm">
                              <Icon name="table" size={16} c="text-secondary" />
                              <Text size="sm" c="text-secondary">
                                {tableGroup.tableName}
                              </Text>
                            </Group>
                          )}
                          {tableGroup.children.length > 0 && (
                            <Stack
                              gap="0.75rem"
                              ml="md"
                              pl="xs"
                              mt="0.75rem"
                              style={{
                                borderLeft:
                                  "2px solid var(--mb-color-border-subtle)",
                              }}
                            >
                              {tableGroup.children.map((child) => (
                                <EntityLink
                                  key={`${child.model}-${child.id}`}
                                  entity={child}
                                />
                              ))}
                            </Stack>
                          )}
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
