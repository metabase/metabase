import { type ReactNode, useMemo } from "react";
import { jt, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
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
  onClick?: () => void;
}

export function Relationships({
  columns,
  row,
  rowId,
  rowName,
  table,
  tableForeignKeys,
  onClick,
}: Props & BoxProps): JSX.Element | null {
  const metadata = useSelector(getMetadata);

  const sortedForeignKeys = useMemo(
    () =>
      tableForeignKeys.toSorted((a, b) => {
        const aDisplayName = a.origin?.table?.display_name ?? "";
        const bDisplayName = b.origin?.table?.display_name ?? "";
        return aDisplayName.localeCompare(bDisplayName);
      }),
    [tableForeignKeys],
  );

  const sortedForeignKeysWithUrls = useMemo(
    () =>
      sortedForeignKeys.map((fk) => ({
        fk,
        url: getUrl({ columns, row, fk, metadata }),
      })),
    [columns, row, sortedForeignKeys, metadata],
  );

  return (
    <Stack data-testid="relationships" gap="md">
      <Text c="text-secondary" fz={17}>
        {jt`${(
          <Text
            c="text-secondary"
            component="span"
            fw="bold"
            fz={17}
            key="row-name"
          >
            {rowName ? rowName : t`This record`}
          </Text>
        )} is connected to:`}
      </Text>

      <Stack gap="md">
        {sortedForeignKeysWithUrls.map(({ fk, url }) => {
          return (
            <Relationship
              key={`${fk.origin_id}-${fk.destination_id}`}
              fk={fk}
              href={url}
              rowId={rowId}
              table={table}
              onClick={onClick}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
