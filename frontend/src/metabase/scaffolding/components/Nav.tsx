import type { ReactNode } from "react";
import { Link } from "react-router";

import { Group, Text, Title } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  children?: ReactNode;
  rowName?: ReactNode;
  rowId?: number | string;
  table: Table;
}

export const Nav = ({ children, rowId, rowName, table }: Props) => {
  return (
    <Group align="flex-start" justify="space-between" pt="xl" px="xl">
      <Group align="flex-end" gap="sm">
        <Link to={`/table/${table.id}`}>
          <Title>{table.display_name}</Title>
        </Link>

        {(rowName ?? rowId) != null && (
          <>
            <Text c="text-medium" size="xl" fw="bold">
              /
            </Text>

            <Link to={`/table/${table.id}/detail/${rowId}`}>
              <Text c="text-medium" size="xl" fw="bold">
                {rowName ?? rowId}
              </Text>
            </Link>
          </>
        )}
      </Group>

      <Group align="center" gap="md">
        {children}
      </Group>
    </Group>
  );
};
