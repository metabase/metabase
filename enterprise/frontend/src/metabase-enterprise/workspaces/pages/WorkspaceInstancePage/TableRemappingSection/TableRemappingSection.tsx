import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { Box, FixedSizeIcon, Group } from "metabase/ui";
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
        <TableRemappingTable remappings={remappings} />
      </TitleSection>
    </Box>
  );
}
