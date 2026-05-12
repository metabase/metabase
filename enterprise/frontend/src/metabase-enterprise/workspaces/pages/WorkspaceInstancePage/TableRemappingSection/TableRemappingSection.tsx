import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { Group, Icon } from "metabase/ui";
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
          <Icon name="database" />
          {database.name}
        </Group>
      }
    >
      <TableRemappingTable remappings={remappings} />
    </TitleSection>
  );
}
