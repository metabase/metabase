import type { ReactNode } from "react";
import { Link } from "react-router";

import { createMockMetadata } from "__support__/metadata";
import { Box, Group, Text, Title } from "metabase/ui";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Table } from "metabase-types/api";

import { TableBreadcrumbs } from "./TableBreadcrumbs";

interface Props {
  children?: ReactNode;
  rowName?: ReactNode;
  rowId?: number | string;
  table: Table;
}

export const Nav = ({ children, rowId, rowName, table }: Props) => {
  return (
    <Group align="center" justify="space-between" pt="xl" px="xl">
      <Group
        align="flex-end"
        gap={0}
        wrap="nowrap"
        flex={1}
        style={{
          fontSize: 20,
        }}
      >
        <TableBreadcrumbs tableId={table.id} />

        {(rowName ?? rowId) != null && (
          <>
            <Separator />

            <Group
              align="flex-end"
              // component={Link}
              gap="sm"
              // to={`/table/${table.id}/detail/${rowId}`}
              style={{
                fontSize: 20,
              }}
              c="text-primary"
              fw="bold"
            >
              {rowId != null && <Box>{rowId}</Box>}

              {rowId != null && <Box>{rowName}</Box>}
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

const Separator = () => (
  <Text c="text-light" pl={"0.5em"} pr={"0.5em"}>
    /
  </Text>
);

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
