import { useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  Card,
  Divider,
  Ellipsified,
  Group,
  Icon,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  IconName,
  TransformTestData,
  TransformTestRow,
  TransformTestRowValue,
  TransformTestRowsData,
} from "metabase-types/api";

type TransformTestDataCardProps = {
  name: string;
  icon: IconName;
  description: string;
  data: TransformTestData;
};

export function TransformTestDataCard({
  name,
  icon,
  description,
  data,
}: TransformTestDataCardProps) {
  return (
    <Card withBorder p={0} aria-label={name}>
      <Group gap="sm" px="lg" py="md" wrap="nowrap">
        <Icon name={icon} c="core-brand" />
        <Text fw="bold">{name}</Text>
        <Text c="text-secondary" ml="auto">
          {description}
        </Text>
      </Group>
      <Divider />
      {data.format === "rows" ? (
        <RowsTable name={name} data={data} />
      ) : (
        <Box bg="background_page-secondary" py="sm">
          <CodeEditor value={data.sql} language="sql" readOnly />
        </Box>
      )}
    </Card>
  );
}

type RowEntry = {
  id: string;
  row: TransformTestRow;
};

type RowsTableProps = {
  name: string;
  data: TransformTestRowsData;
};

function RowsTable({ name, data }: RowsTableProps) {
  const entries = useMemo(
    () => data.rows.map((row, index) => ({ id: String(index), row })),
    [data.rows],
  );
  const columns = useMemo(
    (): TreeTableColumnDef<RowEntry>[] =>
      data.columns.map((column) => ({
        id: column.name,
        header: column.name,
        accessorFn: (entry) => formatValue(entry.row[column.name]),
        minWidth: 80,
        cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
      })),
    [data.columns],
  );

  const instance = useTreeTableInstance({
    data: entries,
    columns,
    getNodeId: (entry) => entry.id,
  });

  return <TreeTable instance={instance} ariaLabel={t`Rows of ${name}`} />;
}

function formatValue(value: TransformTestRowValue | undefined): string {
  return value === undefined ? "" : String(value);
}
