import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { type BoxProps, Stack, Text } from "metabase/ui";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
} from "metabase-types/api";

import { Relationship } from "./Relationship";
import { getUrl } from "./utils";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  rowId: string | number;
  rowName: ReactNode;
  table: Table;
  tableForeignKeys: ForeignKey[];
}

export function Relationships({
  columns,
  row,
  rowId,
  rowName,
  table,
  tableForeignKeys,
}: Props & BoxProps): JSX.Element | null {
  const sortedForeignTables = useMemo(
    () =>
      tableForeignKeys.toSorted((a, b) => {
        const aDisplayName = a.origin?.table?.display_name ?? "";
        const bDisplayName = b.origin?.table?.display_name ?? "";
        return aDisplayName.localeCompare(bDisplayName);
      }),
    [tableForeignKeys],
  );

  return (
    <Stack gap="md">
      <Text c="text-secondary" fw="bold" fz={17}>
        {rowName
          ? t`${rowName} is connected to:`
          : t`This record is connected to:`}
      </Text>

      <Stack gap="md">
        {sortedForeignTables.map((fk) => {
          return (
            <Relationship
              key={`${fk.origin_id}-${fk.destination_id}`}
              fk={fk}
              href={getUrl({ columns, row, table, fk })}
              rowId={rowId}
              table={table}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
