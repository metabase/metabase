import { Fragment } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import { Box, Group, Loader, Text } from "metabase/ui";
import type { PythonTransformTableAliases, TableId } from "metabase-types/api";

import { TableDiff } from "./TableDiff";

interface Props {
  newSourceTables: PythonTransformTableAliases;
  oldSourceTables: PythonTransformTableAliases;
}

export const TransformSourceTablesDiff = ({
  newSourceTables,
  oldSourceTables,
}: Props) => {
  const removedEntries = oldSourceTables.slice(newSourceTables.length);

  return (
    <Box
      display="grid"
      style={{
        alignItems: "center",
        gridTemplateColumns: "auto 1fr",
        rowGap: 4,
        columnGap: 32,
      }}
    >
      {newSourceTables.map((entry, index) => {
        const oldEntry = oldSourceTables[index];
        const oldAlias = oldEntry?.alias;
        const newAlias = entry.alias;
        const sourceNameChanged = oldAlias !== newAlias;

        return (
          <Fragment key={entry.alias}>
            <Group gap="xs">
              {sourceNameChanged && oldAlias && (
                <Text c="danger" component="s" td="line-through">
                  {oldAlias}
                </Text>
              )}

              <Text c={sourceNameChanged ? "success" : undefined}>
                {newAlias}
              </Text>
            </Group>

            <TableItem oldTableId={oldEntry?.table} tableId={entry.table} />
          </Fragment>
        );
      })}

      {removedEntries.map((entry) => {
        return (
          <Fragment key={entry.alias}>
            <Text c="danger" component="s" td="line-through">
              {entry.alias}
            </Text>

            <TableItem oldTableId={entry.table} tableId={undefined} />
          </Fragment>
        );
      })}
    </Box>
  );
};

function TableItem({
  oldTableId,
  tableId,
}: {
  oldTableId: TableId | undefined;
  tableId: TableId | undefined;
}) {
  const { data: oldTable } = useGetTableQuery(
    oldTableId ? { id: oldTableId } : skipToken,
  );
  const { data: table } = useGetTableQuery(
    tableId ? { id: tableId } : skipToken,
  );

  if (!table && tableId) {
    return <Loader size="xs" />;
  }

  return (
    <TableDiff
      newSchema={table?.schema}
      newTable={table?.name}
      oldSchema={oldTable?.schema}
      oldTable={oldTable?.name}
    />
  );
}
