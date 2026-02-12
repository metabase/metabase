import { Fragment, useMemo } from "react";
import { t } from "ttag";

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
  type CollectionGroup,
  TRANSFORMS_ROOT_ID,
  buildNamespaceCollectionMap,
  findLibraryCollectionId,
  getGroupIcon,
  groupEntitiesByCollection,
} from "metabase-enterprise/remote_sync/displayGroups";
import {
  buildCollectionMap,
  getCollectionPathSegments,
  getSyncStatusColor,
  getSyncStatusIcon,
} from "metabase-enterprise/remote_sync/utils";
import type { RemoteSyncEntity } from "metabase-types/api";

import { CollectionPath } from "./CollectionPath";
import { EntityLink } from "./EntityLink";

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

  // Build namespace-to-collection-ids map in a single pass
  const namespaceCollectionMap = useMemo(
    () =>
      buildNamespaceCollectionMap([
        ...collectionTree,
        ...snippetCollectionTree,
      ]),
    [collectionTree, snippetCollectionTree],
  );

  // Find the Transforms root entity (id=-1) if it exists
  const transformsRootEntity = useMemo(() => {
    return entities.find(
      (e) => e.model === "collection" && e.id === TRANSFORMS_ROOT_ID,
    );
  }, [entities]);

  // Find the library collection ID for placing snippets without a collection_id
  const libraryCollectionId = useMemo(
    () => findLibraryCollectionId(collectionTree),
    [collectionTree],
  );

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

  const groupedData: CollectionGroup[] = useMemo(
    () =>
      groupEntitiesByCollection({
        entities,
        transformsRootEntity,
        namespaceCollectionMap,
        collectionMap,
        libraryCollectionId,
        getCollectionPathSegments,
      }),
    [
      entities,
      collectionMap,
      namespaceCollectionMap,
      libraryCollectionId,
      transformsRootEntity,
    ],
  );

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
                      name={getGroupIcon(group.spec)}
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
