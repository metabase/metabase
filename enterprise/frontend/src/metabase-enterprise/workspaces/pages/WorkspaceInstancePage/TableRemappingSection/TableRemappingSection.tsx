import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { FixedSizeIcon, Group } from "metabase/ui";
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
    <TitleSection
      label={
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="database" />
          {database.name}
        </Group>
      }
    >
      <TableRemappingTable remappings={remappings} />
    </TitleSection>
  );
}
