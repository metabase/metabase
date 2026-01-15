import { t } from "ttag";

import { Group, Icon, Stack, Text } from "metabase/ui";
import type { TransformTarget } from "metabase-types/api";

interface Props {
  newTarget: TransformTarget;
  oldTarget: TransformTarget;
}

export const TransformTargetDiff = ({ newTarget, oldTarget }: Props) => {
  const schemaChanged = oldTarget.schema !== newTarget.schema;
  const tableChanged = oldTarget.name !== newTarget.name;

  return (
    <Stack gap="xs">
      <Text component="label" fw="bold">{t`Transform target`}</Text>

      <Group gap="sm">
        <Group gap="xs">
          <Icon c="text-secondary" name="folder" />

          {schemaChanged && (
            <Text c="danger" component="s" td="line-through">
              {oldTarget.schema}
            </Text>
          )}

          <Text c={schemaChanged ? "success" : undefined}>
            {newTarget.schema}
          </Text>
        </Group>

        <Divider />

        <Group gap="xs">
          <Icon c="text-secondary" name="table2" />

          {tableChanged && (
            <Text c="danger" component="s" td="line-through">
              {oldTarget.name}
            </Text>
          )}

          <Text c={tableChanged ? "success" : undefined}>{newTarget.name}</Text>
        </Group>
      </Group>
    </Stack>
  );
};

function Divider() {
  return <Icon name="chevronright" size={8} />;
}
