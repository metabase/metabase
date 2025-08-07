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

const HIGHLIGHTABLE_VARIANTS = ["highlight-2", "normal"];

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
      align="center"
      bg="bg-white"
      gap="xs"
      px="xs"
      wrap="nowrap"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--mantine-radius-md)",
        boxShadow: "0 0 1px var(--mb-color-shadow)",
      }}
    >
      {HIGHLIGHTABLE_VARIANTS.includes(section.variant) && onUpdateSection && (
        <Tooltip
          label={
            section.variant === "normal"
              ? t`Highlight group`
              : t`Remove highlight`
          }
        >
          <SectionAction
            iconName={section.variant === "highlight-2" ? "table" : "list"}
            onClick={() => {
              onUpdateSection({
                variant:
                  section.variant === "normal"
                    ? ("highlight-2" as const)
                    : ("normal" as const),
              });
            }}
          />
        </Tooltip>
      )}

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
