import { Box } from "metabase/ui/components";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPickerButton } from "./ColumnPickerButton";

type ObjectViewSectionProps = {
  columns: DatasetColumn[];
  section: ObjectViewSectionSettings;
  sections: ObjectViewSectionSettings[];
  table: Table;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
};

export function SectionActions({
  columns,
  section,
  sections,
  table,
  onUpdateSection,
}: ObjectViewSectionProps) {
  return (
    <Box>
      {onUpdateSection && (
        <ColumnPickerButton
          columns={columns}
          fieldsLimit={getFieldsLimit(section)}
          section={section}
          sections={sections}
          table={table}
          onUpdateSection={onUpdateSection}
        />
      )}
    </Box>
  );
}

function getFieldsLimit(
  section: ObjectViewSectionSettings,
): number | undefined {
  if (section.variant === "header") {
    return 3;
  }

  if (section.variant === "subheader") {
    return 4;
  }

  return undefined;
}
