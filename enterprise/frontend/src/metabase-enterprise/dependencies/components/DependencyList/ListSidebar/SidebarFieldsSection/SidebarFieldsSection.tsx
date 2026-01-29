import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Badge, Box, Card, Group, Stack, Title } from "metabase/ui";
import type { DependencyNode, Field } from "metabase-types/api";

import { getNodeFields, getNodeFieldsLabel } from "../../../../utils";

import S from "./SidebarFieldsSection.module.css";

type SidebarFieldsSectionProps = {
  node: DependencyNode;
};

export function SidebarFieldsSection({ node }: SidebarFieldsSectionProps) {
  const fields = getNodeFields(node);

  return (
    <Stack role="region" aria-label={t`Fields`}>
      <Group gap="sm" wrap="nowrap">
        <Badge c="text-selected" bg="brand">
          {fields.length}
        </Badge>
        <Title order={5}>{getNodeFieldsLabel(fields.length)}</Title>
      </Group>
      {fields.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {fields.map((field, fieldIndex) => (
            <FieldListItem key={fieldIndex} field={field} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

type FieldListItemProps = {
  field: Field;
};

function FieldListItem({ field }: FieldListItemProps) {
  return (
    <Stack className={S.item} p="md" gap="xs">
      <Box className={CS.textWrap} lh="1rem">
        {field.display_name}
      </Box>
      <Box className={cx(CS.textWrap, CS.textMonospace)} fz="sm" lh="1rem">
        {field.name}
      </Box>
    </Stack>
  );
}
