import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Tooltip,
} from "metabase/ui/components";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import { ColumnListItem } from "./ColumnListItem";
import { EmptyDropZone } from "./EmptyDropZone";
import S from "./TableDetailView.module.css";

export type SectionSettingsProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  onUpdateSection: (update: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
  dragHandleProps?: any;
  isDraggingSection?: boolean;
};

export function SectionSettings({
  section,
  columns,
  onUpdateSection,
  onRemoveSection,
  dragHandleProps,
  isDraggingSection = false,
}: SectionSettingsProps) {
  const columnIds = useMemo(
    () => section.fields.map((field) => field.field_id),
    [section.fields],
  );

  const handleUpdateField = (
    fieldId: number,
    { style }: { style: "normal" | "bold" | "dim" | "title" },
  ) => {
    onUpdateSection({
      fields: section.fields.map((f) => {
        if (f.field_id === fieldId) {
          return { ...f, style };
        }
        return f;
      }),
    });
  };

  const handleHideField = (fieldId: number) => {
    onUpdateSection({
      fields: section.fields.filter((f) => f.field_id !== fieldId),
    });
  };

  return (
    <Box mt="sm" className={S.ObjectViewSidebarSection}>
      <Flex align="center" justify="space-between" w="100%">
        <Group gap="xs">
          <Icon
            name="grabber"
            style={{ cursor: "grab" }}
            {...dragHandleProps}
          />
          <EditableText
            initialValue={section.title}
            onChange={(title) => onUpdateSection({ title })}
            style={{
              display: "block",
              fontWeight: "bold",
            }}
          />
        </Group>
        <Group gap="sm" className={S.ObjectViewSidebarSectionActions}>
          <Tooltip label={t`Flow direction`}>
            <ActionIcon
              color="text-medium"
              variant="transparent"
              onClick={() => {
                onUpdateSection({
                  direction:
                    section.direction === "vertical"
                      ? "horizontal"
                      : "vertical",
                });
              }}
            >
              <Icon
                name={
                  section.direction === "vertical"
                    ? "arrow_down"
                    : "arrow_right"
                }
                size={14}
                style={{
                  transform:
                    section.direction === "vertical"
                      ? undefined
                      : "rotate(180deg)",
                }}
              />
            </ActionIcon>
          </Tooltip>

          {onRemoveSection && (
            <Tooltip label={t`Remove group`}>
              <ActionIcon
                color="text-medium"
                variant="transparent"
                onClick={onRemoveSection}
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Flex>

      {columnIds.length === 0 ? (
        <EmptyDropZone sectionId={String(section.id)} />
      ) : (
        <SortableContext
          id={String(section.id)}
          items={columnIds}
          strategy={verticalListSortingStrategy}
          disabled={isDraggingSection}
        >
          <Box mt="sm">
            <ul style={{ width: "100%" }}>
              {section.fields.map((fieldSettings) => {
                const column = columns.find(
                  (column) => column.id === fieldSettings.field_id,
                );
                if (!column) {
                  return null;
                }
                return (
                  <ColumnListItem
                    key={fieldSettings.field_id}
                    column={column}
                    style={fieldSettings.style}
                    onChangeFieldSettings={(update) =>
                      handleUpdateField(fieldSettings.field_id, update)
                    }
                    onHideField={() => handleHideField(fieldSettings.field_id)}
                  />
                );
              })}
            </ul>
          </Box>
        </SortableContext>
      )}
    </Box>
  );
}
