import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import {
  Card,
  Ellipsified,
  Flex,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useGetDataAppGroupsQuery } from "metabase-enterprise/api";
import type { DataApp, DataAppGroup, GroupId } from "metabase-types/api";

import { DataAppGroupDataAccess } from "./DataAppGroupDataAccess";
import { DataAppGroupMenu } from "./DataAppGroupMenu";

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
  const {
    data: groups = [],
    isLoading,
    error,
  } = useGetDataAppGroupsQuery(app.name);

  const columns = useMemo<TreeTableColumnDef<DataAppGroup>[]>(
    () => [
      {
        id: "name",
        accessorFn: (group) => getGroupNameLocalized(group),
        header: t`Group name`,
        minWidth: 200,
        cell: ({ row }) => (
          <Ellipsified>{getGroupNameLocalized(row.original)}</Ellipsified>
        ),
      },
      {
        id: "member_count",
        accessorKey: "member_count",
        header: t`Members`,
        minWidth: 120,
      },
      {
        id: "data_access",
        header: t`Data access`,
        minWidth: 200,
        cell: ({ row }) => (
          <DataAppGroupDataAccess app={app} group={row.original} />
        ),
      },
      {
        id: "actions",
        header: "",
        width: 48,
        cell: ({ row }) => <DataAppGroupMenu app={app} group={row.original} />,
      },
    ],
    [app],
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
          <TreeTableSkeleton columnWidths={[0.4, 0.2, 0.35, 0.05]} />
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
