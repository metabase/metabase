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
  const oldSourceTablesIds = Object.values(oldSourceTables);
  const newSourceTablesIds = Object.values(newSourceTables);

  const oldSourceNames = Object.fromEntries(
    Object.entries(oldSourceTables).map(([k, v]) => [v, k]),
  );
  const newSourceNames = Object.fromEntries(
    Object.entries(newSourceTables).map(([k, v]) => [v, k]),
  );

  const removedTablesIds = oldSourceTablesIds.slice(newSourceTablesIds.length);

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
      {newSourceTablesIds.map((id, index) => {
        const oldTableId = oldSourceTablesIds[index];
        const oldSourceName = oldSourceNames[oldTableId];
        const newSourceName = newSourceNames[id];
        const sourceNameChanged = oldSourceName !== newSourceName;

        return (
          <Fragment key={id}>
            <Group gap="xs">
              {sourceNameChanged && oldSourceName && (
                <Text c="danger" component="s" td="line-through">
                  {oldSourceName}
                </Text>
              )}

              <Text c={sourceNameChanged ? "success" : undefined}>
                {newSourceName}
              </Text>
            </Group>

            <TableItem oldTableId={oldTableId} tableId={id} />
          </Fragment>
        );
      })}

      {removedTablesIds.map((id) => {
        const oldSourceName = oldSourceNames[id];

        return (
          <Fragment key={id}>
            <Text c="danger" component="s" td="line-through">
              {oldSourceName}
            </Text>

            <TableItem oldTableId={id} tableId={undefined} />
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
