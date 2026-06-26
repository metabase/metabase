import { t } from "ttag";

import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { Box, FixedSizeIcon, Group, Text } from "metabase/ui";
import type { Database, TableRemapping } from "metabase-types/api";

import { TableRemappingTable } from "./TableRemappingTable";

type TableRemappingSectionProps = {
  database: Database;
  remappings: TableRemapping[];
};

export function TableRemappingSection({
  database,
  remappings,
}: TableRemappingSectionProps) {
  return (
    <Box role="region" aria-label={database.name}>
      <TitleSection
        label={
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="database" aria-hidden />
            {database.name}
          </Group>
        }
      >
        {remappings.length === 0 ? (
          <Text p="lg">
            {t`Tables will be remapped here the first time a transform runs in this workspace for this database.`}
          </Text>
        ) : (
          <TableRemappingTable remappings={remappings} />
        )}
      </TitleSection>
    </Box>
  );
}
