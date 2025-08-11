import { t } from "ttag";

import { Group, Tooltip } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPickerButton } from "./ColumnPickerButton";
import { SectionAction } from "./SectionAction";
import { getFieldsLimit } from "./use-detail-view-sections";

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
  const isHighlightShown =
    HIGHLIGHTABLE_VARIANTS.includes(section.variant) && onUpdateSection != null;
  const isAddColumnShown = onUpdateSection != null;
  const isRemoveSectionShown = onRemoveSection != null;

  const buttonsCount = [
    isHighlightShown,
    isAddColumnShown,
    isRemoveSectionShown,
  ].filter(Boolean).length;

  return (
    <Group
      align="center"
      bg="bg-white"
      gap="xs"
      px={buttonsCount > 1 ? "xs" : 0}
      wrap="nowrap"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--mantine-radius-md)",
        boxShadow: "0 0 1px var(--mb-color-shadow)",
      }}
    >
      {isHighlightShown && (
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

      {isAddColumnShown && (
        <ColumnPickerButton
          columns={columns}
          fieldsLimit={getFieldsLimit(section)}
          section={section}
          sections={sections}
          table={table}
          onUpdateSection={onUpdateSection}
        />
      )}

      {isRemoveSectionShown && (
        <Tooltip label={t`Remove group`}>
          <SectionAction iconName="close" onClick={onRemoveSection} />
        </Tooltip>
      )}
    </Group>
  );
}
