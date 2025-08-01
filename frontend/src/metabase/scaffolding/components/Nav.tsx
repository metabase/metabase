import type { ReactNode } from "react";
import { Link } from "react-router";

import { createMockMetadata } from "__support__/metadata";
import { Group, Text, Title } from "metabase/ui";
import * as ML_Urls from "metabase-lib/v1/urls";
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
        <Link to={getExploreTableUrl(table)}>
          <Title>{table.display_name}</Title>
        </Link>

        {(rowName ?? rowId) != null && (
          <>
            <Text c="text-medium" size="xl" fw="bold">
              /
            </Text>

            <Group
              component={Link}
              gap="sm"
              to={`/table/${table.id}/detail/${rowId}`}
            >
              {rowId != null && (
                <Text c="text-medium" size="xl" fw="bold">
                  {rowId}
                </Text>
              )}

              {rowId != null && (
                <Text c="text-medium" size="xl" fw="bold">
                  {rowName}
                </Text>
              )}
            </Group>
          </>
        )}
      </Group>

      <Group align="center" gap="md">
        {children}
      </Group>
    </Group>
  );
};

export function getExploreTableUrl(table: Table): string {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataTable = metadata?.table(table.id);
  const question = metadataTable?.newQuestion();

  if (!question) {
    throw new Error("Unable to create question");
  }

  return ML_Urls.getUrl(question);
}
