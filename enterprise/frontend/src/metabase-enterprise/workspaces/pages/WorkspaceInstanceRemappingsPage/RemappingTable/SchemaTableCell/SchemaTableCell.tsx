import { Ellipsified, FixedSizeIcon, Group, Text } from "metabase/ui";

type SchemaTableCellProps = {
  schema: string;
  tableName: string;
};

export function SchemaTableCell({ schema, tableName }: SchemaTableCellProps) {
  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="table2" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>
        {schema}
        <Text component="span" c="text-primary" mx={2}>
          /
        </Text>
        {tableName}
      </Ellipsified>
    </Group>
  );
}
