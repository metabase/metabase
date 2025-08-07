import { t } from "ttag";

import { Group, Tooltip } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPickerButton } from "./ColumnPickerButton";
import { SectionAction } from "./SectionAction";

type ObjectViewSectionProps = {
  columns: DatasetColumn[];
  section: ObjectViewSectionSettings;
  sections: ObjectViewSectionSettings[];
  table: Table;
  onRemoveSection?: () => void;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
};

export function SectionActions({
  columns,
  section,
  sections,
  table,
  onRemoveSection,
  onUpdateSection,
}: ObjectViewSectionProps) {
  return (
    <Group
      bg="bg-white"
      gap="xs"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--mantine-radius-md)",
        boxShadow: "0 0 1px var(--mb-color-shadow)",
      }}
    >
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

      {onRemoveSection && (
        <Tooltip label={t`Remove group`}>
          <SectionAction iconName="close" onClick={onRemoveSection} />
        </Tooltip>
      )}
    </Group>
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
