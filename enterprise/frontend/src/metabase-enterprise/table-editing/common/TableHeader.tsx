import type { PropsWithChildren } from "react";

import { useGetDatabaseQuery, useGetTableQuery } from "metabase/api";
import { Group, Skeleton, rem } from "metabase/ui";

import { TableBreadcrumbs } from "./TableBreadcrumbs";

type TableHeaderProps = PropsWithChildren<{
  databaseId: number;
  tableId: number;
  showEditBreadcrumb?: boolean;
}>;

export function TableHeader({
  databaseId,
  tableId,
  children,
  showEditBreadcrumb = false,
}: TableHeaderProps) {
  const { data: table } = useGetTableQuery({ id: tableId });
  const { data: database } = useGetDatabaseQuery({ id: databaseId });

  return (
    <Group
      justify="space-between"
      align="center"
      p="0.5rem 1rem 0.5rem 2rem"
      mih="4rem"
      bg="background-primary"
    >
      {database && table ? (
        <TableBreadcrumbs
          database={database}
          table={table}
          showEditBreadcrumb={showEditBreadcrumb}
        />
      ) : (
        <Skeleton height={rem(24)} width={rem(300)} />
      )}

      <Group gap="md">{children}</Group>
    </Group>
  );
}
