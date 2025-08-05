import type { ReactNode } from "react";

import { createMockMetadata } from "__support__/metadata";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Group, Text } from "metabase/ui";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValue,
  Table,
} from "metabase-types/api";

import { renderValue } from "../utils";

import { TableBreadcrumbs } from "./TableBreadcrumbs";

interface Props {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  children?: ReactNode;
  row: RowValue[];
  rowName?: ReactNode;
  rowId?: number | string;
  table: Table;
}

export const Nav = ({
  columns,
  sections,
  children,
  row,
  rowId,
  rowName,
  table,
}: Props) => {
  const tc = useTranslateContent();
  const headerSection = sections.find((s) => s.variant === "header");

  // const values = headerSection.fields
  //   .map(({ field_id }) => {
  //     const columnIndex = columns.findIndex((column) => column.id === field_id);
  //     const column = columns[columnIndex];
  //     const value = row[columnIndex];
  //     return value;
  //   })
  //   .filter((value) => value != null && value !== "");

  // keep in sync with equivalent implementation in ObjectViewSection
  const headerText = (headerSection?.fields ?? [])
    .map(({ field_id }) => {
      const columnIndex = columns.findIndex((column) => column.id === field_id);
      const column = columns[columnIndex];

      if (!column) {
        return null;
      }

      const value = row[columnIndex];
      return renderValue(tc, value, column, { jsx: false });
    })
    .join(" ");

  const showValues = headerText.trim().length > 0;
  const isDefaultValid =
    (rowName != null && !Number.isNaN(rowName)) ||
    (rowId != null && !Number.isNaN(rowId));

  return (
    <Group
      align="center"
      justify="space-between"
      pt={15.5}
      pb={15.5}
      pl="xl"
      pr="md"
    >
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

        {showValues && (
          <>
            <Separator />

            <Ellipsified c="text-primary" fw="bold" flex="1">
              {headerText}
            </Ellipsified>
          </>
        )}

        {!showValues && isDefaultValid && (
          <>
            <Separator />

            <Group
              flex="1"
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
              {rowId != null && !Number.isNaN(rowId) && <Box>{rowId}</Box>}

              {rowName != null && !Number.isNaN(rowName) && (
                <Box>{rowName}</Box>
              )}
            </Group>
          </>
        )}
      </Group>

      <Group flex="0 0 auto" align="center" gap="md">
        {children}
      </Group>
    </Group>
  );
};

const Separator = () => (
  <Text c="text-light" px={7.2} style={{ fontSize: 14.4 }} fw={700}>
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
