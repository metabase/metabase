import cx from "classnames";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import CS from "metabase/css/core/index.css";
import {
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DependencyNode, Field } from "metabase-types/api";

import { getNodeFields, getNodeFieldsLabel } from "../../../../utils";

import S from "./FieldsSection.module.css";

type FieldsSectionProps = {
  node: DependencyNode;
};

export function FieldsSection({ node }: FieldsSectionProps) {
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
  const fieldInfo = Lib.legacyColumnTypeInfo(field);
  const fieldIcon = getColumnIcon(fieldInfo);

  return (
    <Stack className={S.item} p="md" gap="xs">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name={fieldIcon} c="brand" />
        <Box className={CS.textWrap} lh="1rem">
          {field.display_name}
        </Box>
      </Group>
      <Box
        className={cx(CS.textWrap, CS.textMonospace)}
        ml="md"
        pl="xs"
        fz="sm"
        lh="1rem"
      >
        {field.name}
      </Box>
    </Stack>
  );
}
