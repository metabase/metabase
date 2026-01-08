import { Fragment, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
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
} from "metabase-enterprise/remote_sync/utils";
import type { Collection, RemoteSyncEntity } from "metabase-types/api";

import { CollectionPath } from "./CollectionPath";
import { EntityLink } from "./EntityLink";

const SYNC_STATUS_ORDER: RemoteSyncEntity["sync_status"][] = [
  "create",
  "update",
  "touch",
  "delete",
];

interface AllChangesViewProps {
  entities: RemoteSyncEntity[];
  collections: Collection[];
  title?: string;
}

export const AllChangesView = ({
  entities,
  collections,
  title,
}: AllChangesViewProps) => {
  const { data: collectionTree = [] } = useListCollectionsTreeQuery();

  // Fetch collection tree for shared-tenant-collections namespace
  // This is needed to show changes in tenant collections that have is_remote_synced=true
  const { data: tenantCollectionTree = [] } = useListCollectionsTreeQuery({
    namespace: "shared-tenant-collection",
  });

  const collectionMap = useMemo(() => {
    const map = new Map([
      ...buildCollectionMap(collectionTree),
      ...buildCollectionMap(tenantCollectionTree),
    ]);

    // Add all synced collections to the map, including those from namespaces.
    // This ensures that collections from namespaces like "shared-tenant-collection"
    // are available when building collection path segments.
    collections.forEach((c) => {
      if (typeof c.id === "number") {
        map.set(c.id, c);
      }
    });

    return map;
  }, [collectionTree, tenantCollectionTree, collections]);

  const hasRemovals = useMemo(() => {
    return (
      entities.findIndex((e) =>
        ["removed", "delete"].includes(e.sync_status),
      ) >= 0
    );
  }, [entities]);

  const groupedData = useMemo(() => {
    const byCollection = _.groupBy(entities, (e) => e.collection_id || 0);

    return Object.entries(byCollection)
      .map(([collectionId, items]) => {
        const collectionEntity = items.find(
          (item) =>
            item.model === "collection" && item.id === Number(collectionId),
        );
        const nonCollectionItems = items.filter(
          (item) =>
            !(item.model === "collection" && item.id === Number(collectionId)),
        );

        return {
          pathSegments: getCollectionPathSegments(
            Number(collectionId) || undefined,
            collectionMap,
          ),
          collectionId: Number(collectionId) || undefined,
          collectionEntity,
          items: nonCollectionItems.sort((a, b) => {
            const statusOrderA = SYNC_STATUS_ORDER.indexOf(a.sync_status);
            const statusOrderB = SYNC_STATUS_ORDER.indexOf(b.sync_status);
            if (statusOrderA !== statusOrderB) {
              return statusOrderA - statusOrderB;
            }
            return a.name.localeCompare(b.name);
          }),
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
          {groupedData.map((group, groupIndex) => (
            <Fragment key={group.collectionId}>
              {groupIndex > 0 && <Divider />}
              <Box p="md">
                <Group
                  p="sm"
                  gap="sm"
                  mb={group.items.length > 0 ? "0.75rem" : 0}
                  bg="background-secondary"
                  bdrs="md"
                >
                  <Icon name="synced_collection" size={16} c="text-secondary" />
                  <CollectionPath segments={group.pathSegments} />
                  {group.collectionEntity && (
                    <Icon
                      name={getSyncStatusIcon(
                        group.collectionEntity.sync_status,
                      )}
                      size={16}
                      c={getSyncStatusColor(group.collectionEntity.sync_status)}
                      ml="auto"
                    />
                  )}
                </Group>
                {group.items.length > 0 && (
                  <Stack
                    gap="0.75rem"
                    ml="md"
                    pl="xs"
                    style={{
                      borderLeft: "2px solid var(--mb-color-border)",
                    }}
                  >
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
          ))}
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
