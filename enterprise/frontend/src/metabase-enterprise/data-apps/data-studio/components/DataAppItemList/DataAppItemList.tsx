import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useNavigate } from "metabase/router";
import {
  Card,
  Ellipsified,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { CollectionItem, DataApp } from "metabase-types/api";

type DataAppItemListProps = {
  app: DataApp;
  model: "card" | "action";
  emptyMessage: string;
  getItemUrl: (itemId: number) => string;
};

export function DataAppItemList({
  app,
  model,
  emptyMessage,
  getItemUrl,
}: DataAppItemListProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, error } = useListCollectionItemsQuery({
    id: app.resource_collection_id,
    models: [model],
  });
  const items = useMemo(() => data?.data ?? [], [data]);

  const handleRowActivate = useCallback(
    (row: { original: CollectionItem }) => {
      navigate(getItemUrl(row.original.id));
    },
    [navigate, getItemUrl],
  );

  const columns = useMemo<TreeTableColumnDef<CollectionItem>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 200,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: items,
    columns,
    getNodeId: (item) => String(item.id),
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    onRowActivate: handleRowActivate,
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <Stack style={{ overflow: "hidden" }}>
      <TextInput
        placeholder={t`Search...`}
        leftSection={<Icon name="search" />}
        bdrs="sm"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Flex direction="column" flex={1} mih={0}>
        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[1]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              emptyState={
                <ListEmptyState
                  label={searchQuery ? t`Nothing found` : emptyMessage}
                />
              }
              onRowClick={handleRowActivate}
            />
          )}
        </Card>
      </Flex>
    </Stack>
  );
}
