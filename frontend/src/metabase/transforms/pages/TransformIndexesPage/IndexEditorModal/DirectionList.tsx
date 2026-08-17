import { t } from "ttag";

import {
  Card,
  type ComboboxItem,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import type { IndexColumn, IndexColumnDirection } from "metabase-types/api";

type DirectionListProps = {
  columns: IndexColumn[];
  options: ComboboxItem[];
  onChange: (columnName: string, direction: IndexColumnDirection) => void;
  disabled?: boolean;
};

export function DirectionList({
  columns,
  options,
  onChange,
  disabled,
}: DirectionListProps) {
  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="sm">
        <Text fw="bold">{t`Sort order for each column to be stored in`}</Text>
        {columns.map((column) => (
          <Group key={column.name} justify="space-between" wrap="nowrap">
            <Text>{getColumnLabel(options, column.name)}</Text>
            <SegmentedControl
              value={column.direction}
              onChange={(direction) =>
                // Unjustified type cast. FIXME
                onChange(column.name, direction as IndexColumnDirection)
              }
              data={getDirectionOptions()}
              disabled={disabled}
            />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function getColumnLabel(columns: ComboboxItem[], columnName: string) {
  return (
    columns.find((option) => option.value === columnName)?.label ?? columnName
  );
}

function getDirectionOptions(): {
  value: IndexColumnDirection;
  label: string;
}[] {
  return [
    { value: "asc", label: t`Asc` },
    { value: "desc", label: t`Desc` },
  ];
}
