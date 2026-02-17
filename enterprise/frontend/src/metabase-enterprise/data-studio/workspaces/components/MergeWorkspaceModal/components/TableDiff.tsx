import { Group, Icon, Text } from "metabase/ui";
import type { SchemaName } from "metabase-types/api";

interface Props {
  newSchema: SchemaName | null | undefined;
  newTable: string | undefined;
  oldSchema: SchemaName | null | undefined;
  oldTable: string | undefined;
}

export const TableDiff = ({
  newSchema,
  newTable,
  oldSchema,
  oldTable,
}: Props) => {
  const schemaChanged = oldSchema !== newSchema;
  const tableChanged = oldTable !== newTable;

  return (
    <Group gap="sm">
      <Group gap="xs">
        <Icon c="text-secondary" name="folder" />

        {schemaChanged && oldSchema && (
          <Text c="danger" component="s" td="line-through">
            {oldSchema}
          </Text>
        )}

        {newSchema && (
          <Text c={schemaChanged ? "success" : undefined}>{newSchema}</Text>
        )}
      </Group>

      <Divider />

      <Group gap="xs">
        <Icon c="text-secondary" name="table2" />

        {tableChanged && oldTable && (
          <Text c="danger" component="s" td="line-through">
            {oldTable}
          </Text>
        )}

        {newTable && (
          <Text c={tableChanged ? "success" : undefined}>{newTable}</Text>
        )}
      </Group>
    </Group>
  );
};

function Divider() {
  return <Icon name="chevronright" size={8} />;
}
