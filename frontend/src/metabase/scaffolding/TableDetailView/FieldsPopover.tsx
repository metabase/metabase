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
import { t } from "ttag";

import { ActionIcon, Box, Group, Stack, Text } from "metabase/ui/components";
import { Icon, type IconName } from "metabase/ui/components/icons";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

type Section = ObjectViewSectionSettings;

interface SortableFieldItemProps {
  field: {
    field_id: number;
  };
  column: DatasetColumn;
  onRemoveItem?: (fieldId: number) => void;
}

function SortableFieldItem({
  field,
  column,
  onRemoveItem,
}: SortableFieldItemProps) {
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
      py="xs"
      px="md"
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
      <Group gap="xs" align="center" justify="space-between">
        <Group gap="sm" align="center">
          <Icon name="grabber" size={12} />

          <Icon name={getIconForField(column) as IconName} />

          <Text>{column?.display_name || String(field.field_id)}</Text>
        </Group>

        {!!onRemoveItem && (
          <ActionIcon
            onClick={() => {
              onRemoveItem(field.field_id);
            }}
            // stop dragging behaviour
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Icon name="close" size={12} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  );
}

interface FieldsPopoverProps {
  section: Section;
  fieldsLimit?: number;
  usedFieldIds: Set<string>;
  columns: DatasetColumn[];
  onUpdateSection: (sectionId: number, update: Partial<Section>) => void;
  onClose: () => void;
}

export function FieldsPopover({
  section,
  fieldsLimit,
  usedFieldIds,
  columns,
  onUpdateSection,
  onClose,
}: FieldsPopoverProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Filter columns to get available fields
  const availableFields = columns.filter(
    (col: DatasetColumn) => !usedFieldIds.has(String(col.id)),
  );

  const handleRemoveItem = (fieldId: number) => {
    onUpdateSection(section.id, {
      fields: section.fields.filter((field) => field.field_id !== fieldId),
    });
  };

  const limitReached =
    fieldsLimit != null && section.fields.length >= fieldsLimit;

  return (
    <Box p="lg" w="25rem">
      <Group justify="space-between">
        <Text fw="bold" mb="sm">{t`Fields for ${section.title}`}</Text>
        <ActionIcon
          onClick={() => {
            onClose();
          }}
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      </Group>

      {section.fields.length > 0 && (
        <>
          <Text size="xs" fw="bold" c="text-medium" mb="sm" tt="uppercase">
            {t`Showing`} {fieldsLimit != null ? t`(Max ${fieldsLimit})` : null}
          </Text>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
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
                  const column = columns.find((col: DatasetColumn) => {
                    return String(col.id) === String(field.field_id);
                  });

                  return (
                    <SortableFieldItem
                      key={field.field_id}
                      field={field}
                      column={column}
                      onRemoveItem={(fieldId: number) =>
                        handleRemoveItem(fieldId)
                      }
                    />
                  );
                })}
              </Stack>
            </SortableContext>
          </DndContext>
        </>
      )}

      {availableFields.length > 0 && (
        <>
          <Text size="xs" fw="bold" c="text-medium" mb="sm" tt="uppercase">
            {t`Not showing`}
          </Text>

          <Stack gap="xs">
            {availableFields.map((column) => (
              <Group
                key={column.id}
                px="md"
                py="xs"
                h={38}
                gap="sm"
                align="center"
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--default-border-radius)",
                  backgroundColor: "var(--mb-color-bg-white)",
                  cursor: limitReached ? undefined : "pointer",
                }}
                onClick={() => {
                  if (limitReached) {
                    return;
                  }

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
                {!limitReached && <Icon name="add" size={12} />}

                <Icon name={getIconForField(column) as IconName} />

                <Text>{column.display_name}</Text>
              </Group>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
