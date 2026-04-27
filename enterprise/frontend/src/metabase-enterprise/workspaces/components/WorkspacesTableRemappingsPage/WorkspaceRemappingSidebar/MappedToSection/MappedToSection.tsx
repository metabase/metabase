import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Card, FixedSizeIcon, Group, Stack } from "metabase/ui";
import type { WorkspaceRemapping } from "metabase-types/api";

import S from "./MappedToSection.module.css";

type MappedToSectionProps = {
  remapping: WorkspaceRemapping;
};

export function MappedToSection({ remapping }: MappedToSectionProps) {
  return (
    <Card
      p={0}
      shadow="none"
      withBorder
      role="region"
      aria-label={t`Mapped to`}
    >
      <Stack className={S.section} p="md" gap="xs">
        <Box c="text-secondary" fz="sm" lh="h5">
          {t`Mapped to`}
        </Box>
        <Group gap="sm" wrap="nowrap" lh="h4">
          <FixedSizeIcon name="table2" />
          <Box className={CS.textWrap}>
            {remapping.to_schema}
            <Box component="span" c="text-primary" mx={2}>
              /
            </Box>
            {remapping.to_table_name}
          </Box>
        </Group>
      </Stack>
    </Card>
  );
}
