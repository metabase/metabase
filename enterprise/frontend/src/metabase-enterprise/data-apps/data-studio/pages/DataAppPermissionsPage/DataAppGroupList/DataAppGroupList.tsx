import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/settings";
import {
  Card,
  Flex,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useGetDataAppGroupsQuery } from "metabase-enterprise/api";
import type { DataApp, GroupId } from "metabase-types/api";

import { getColumns } from "./utils";

type DataAppGroupListProps = {
  app: DataApp;
  selectedGroupId: GroupId | undefined;
  onSelectGroup: (groupId: GroupId) => void;
};

export function DataAppGroupList({
  app,
  selectedGroupId,
  onSelectGroup,
}: DataAppGroupListProps) {
  const isTenantsEnabled = useSetting("use-tenants");
  const {
    data: groups = [],
    isLoading,
    error,
  } = useGetDataAppGroupsQuery(app.slug);

  const columns = useMemo(
    () => getColumns({ app, isTenantsEnabled }),
    [app, isTenantsEnabled],
  );

  const treeTableInstance = useTreeTableInstance({
    data: groups,
    columns,
    getNodeId: (group) => String(group.id),
    selectedRowId: selectedGroupId != null ? String(selectedGroupId) : null,
    onRowActivate: (row) => onSelectGroup(row.original.id),
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <Flex direction="column" flex={1} mih={0}>
      <Card withBorder p={0}>
        {isLoading ? (
          <TreeTableSkeleton
            columnWidths={
              isTenantsEnabled
                ? [0.35, 0.2, 0.3, 0.1, 0.05]
                : [0.4, 0.2, 0.35, 0.05]
            }
          />
        ) : (
          <TreeTable
            instance={treeTableInstance}
            onRowClick={(row) => onSelectGroup(row.original.id)}
            emptyState={
              <ListEmptyState
                label={t`Only admins can open this app. Add groups to give people in them access.`}
              />
            }
          />
        )}
      </Card>
    </Flex>
  );
}
