import { Group, Icon, Stack, Text } from "metabase/ui";
import type { PythonTransformTableAliases } from "metabase-types/api";

import _ from "underscore";

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
  const uniqueTableIds = _.uniq([...oldSourceTablesIds, ...newSourceTablesIds]);
  const oldSourceNames = Object.fromEntries(
    Object.entries(oldSourceTables).map(([k, v]) => [v, k]),
  );
  const newSourceNames = Object.fromEntries(
    Object.entries(newSourceTables).map(([k, v]) => [v, k]),
  );

  const removedTablesIds = oldSourceTablesIds.filter(
    (id) => !newSourceTablesIds.includes(id),
  );
  const addedTablesIds = newSourceTablesIds.filter(
    (id) => !oldSourceTablesIds.includes(id),
  );
  // const renamedTablesIds = oldSourceTablesIds.filter((id) => )

  return (
    <Stack gap="sm">
      {uniqueTableIds.map((id) => {
        const isRemoved =
          oldSourceTablesIds.includes(id) && !newSourceTablesIds.includes(id);
        const isAdded =
          !oldSourceTablesIds.includes(id) && newSourceTablesIds.includes(id);
        const isRenamed =
          oldSourceTablesIds.includes(id) &&
          newSourceTablesIds.includes(id) &&
          oldSourceNames[id] !== newSourceNames[id];

        return (
          <Group gap="xs" key={id}>
            <Icon c="text-secondary" name="folder" />

            {isRemoved && (
              <Text c="danger" component="s" td="line-through">
                {oldSourceTables.schema}
              </Text>
            )}

            <Text c={schemaChanged ? "success" : undefined}>
              {newSourceTables.schema}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
};

function Divider() {
  return <Icon name="chevronright" size={8} />;
}
