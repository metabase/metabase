import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useRef } from "react";
import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui/components";
import { Icon } from "metabase/ui/components/icons";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

type Section = ObjectViewSectionSettings;

interface SortableFieldItemProps {
  field: {
    field_id: number;
  };
  column?: DatasetColumn;
}

function SortableFieldItem({ field, column }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(field.field_id) });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      p="xs"
      style={{
        ...style,
        border: "1px solid var(--border-color)",
        borderRadius: "var(--default-border-radius)",
        backgroundColor: "var(--mb-color-bg-white)",
        cursor: "grab",
      }}
      {...attributes}
      {...listeners}
    >
      <Group gap="xs" align="center">
        <Icon name="grabber" size={12} />
        <Text size="sm">{column?.display_name || String(field.field_id)}</Text>
      </Group>
    </Box>
  );
}

interface FieldsPopoverProps {
  isOpen: boolean;
  section: Section;
  usedFieldIds: Set<string>;
  columns: DatasetColumn[];
  onUpdateSection: (sectionId: number, update: Partial<Section>) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export function FieldsPopover({
  isOpen,
  section,
  usedFieldIds,
  columns,
  onUpdateSection,
  onClose,
  triggerRef,
}: FieldsPopoverProps) {
  const isDraggingRef = useRef(false);
  const shouldKeepOpenRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle clicks outside the popover
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking on the trigger element
      if (triggerRef?.current?.contains(target)) {
        return;
      }

      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !isDraggingRef.current &&
        !shouldKeepOpenRef.current
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  // Filter columns to get available fields
  const availableFields = columns.filter(
    (col: DatasetColumn) => !usedFieldIds.has(String(col.id)),
  );

  return (
    <Box
      ref={popoverRef}
      pos="absolute"
      top="100%"
      left={0}
      mt="xs"
      bg="white"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--default-border-radius)",
        boxShadow: "var(--mb-shadow-lg)",
        zIndex: 1000,
        minWidth: 300,
        maxHeight: 400,
        overflowY: "auto",
        display: isOpen ? "block" : "none",
      }}
      p="md"
    >
      <Text fw={600} mb="sm">{t`Fields for ${section.title}`}</Text>

      {/* Showing group */}
      {section.fields.length > 0 && (
        <>
          <Text size="xs" fw={600} c="text-medium" mb="xs" tt="uppercase">
            {t`Showing`}
          </Text>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              isDraggingRef.current = true;
              shouldKeepOpenRef.current = true;
            }}
            onDragEnd={(event) => {
              isDraggingRef.current = false;
              shouldKeepOpenRef.current = false;

              const { active, over } = event;
              if (over && active.id !== over.id) {
                const oldIndex = section.fields.findIndex(
                  (field) => String(field.field_id) === String(active.id),
                );
                const newIndex = section.fields.findIndex(
                  (field) => String(field.field_id) === String(over.id),
                );
                if (oldIndex !== -1 && newIndex !== -1) {
                  const newFields = [...section.fields];
                  const [movedField] = newFields.splice(oldIndex, 1);
                  newFields.splice(newIndex, 0, movedField);
                  onUpdateSection(section.id, { fields: newFields });
                }
              }
            }}
          >
            <SortableContext
              items={section.fields.map((field) => String(field.field_id))}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs" mb="md">
                {section.fields.map((field, _fieldIndex) => {
                  const column = columns.find(
                    (col: DatasetColumn) =>
                      String(col.id) === String(field.field_id),
                  );

                  return (
                    <SortableFieldItem
                      key={field.field_id}
                      field={field}
                      column={column}
                    />
                  );
                })}
              </Stack>
            </SortableContext>
          </DndContext>
        </>
      )}

      {/* Not showing group */}
      {availableFields.length > 0 && (
        <>
          <Text size="xs" fw={600} c="text-medium" mb="xs" tt="uppercase">
            {t`Not showing`}
          </Text>
          <Stack gap="xs">
            {availableFields.map((column) => (
              <Box
                key={column.id}
                p="xs"
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--default-border-radius)",
                  backgroundColor: "var(--mb-color-bg-white)",
                  cursor: "pointer",
                }}
                onClick={() => {
                  // Add field to current section
                  const newField = {
                    field_id: column.id as number,
                  };

                  // Update parent
                  onUpdateSection(section.id, {
                    fields: [...section.fields, newField],
                  });
                }}
              >
                <Group gap="xs" align="center">
                  <Icon name="add" size={12} />
                  <Text size="sm">{column.display_name}</Text>
                </Group>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
