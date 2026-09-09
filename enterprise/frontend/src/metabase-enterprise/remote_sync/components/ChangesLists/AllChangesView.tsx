import { Fragment, useMemo } from "react";
import { t } from "ttag";

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
import { getGroupIcon } from "metabase-enterprise/remote_sync/displayGroups";
import { useCollectionGroups } from "metabase-enterprise/remote_sync/hooks/use-collection-groups";
import {
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
  const { groups: groupedData } = useCollectionGroups(entities);

  const hasRemovals = useMemo(() => {
    return (
      entities.findIndex((e) =>
        ["removed", "delete"].includes(e.sync_status),
      ) >= 0
    );
  }, [entities]);

  return (
    <Box>
      {!!title && (
        <Title order={4} mb="lg" c="text-secondary">
          {title}
        </Title>
      )}

      <Paper
        withBorder
        radius="sm"
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
                <Box p="lg">
                  <Group
                    p="sm"
                    gap="sm"
                    mb={hasItems ? "0.75rem" : 0}
                    bg="background_page-secondary"
                    bdrs="sm"
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
                      ml="lg"
                      pl="xxs"
                      style={{
                        borderLeft: "2px solid var(--mb-color-border-neutral)",
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
                              ml="lg"
                              pl="xxs"
                              mt="0.75rem"
                              style={{
                                borderLeft:
                                  "2px solid var(--mb-color-border-neutral-subtle)",
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
          c="feedback-negative"
          fz="sm"
          lh="sm"
          mt="sm"
        >{t`Other instances using this synced collection may have items that depend on the items you're removing.`}</Text>
      )}
    </Box>
  );
};
