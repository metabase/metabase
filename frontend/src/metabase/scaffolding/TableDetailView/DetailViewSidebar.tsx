/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { useRef, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Popover, Stack, Text } from "metabase/ui/components";
import { Icon } from "metabase/ui/components/icons";
import type { DatasetColumn } from "metabase-types/api";

interface SortableFieldItemProps {
  field: {
    field_id: string;
    style: "normal" | "bold" | "dim" | "title";
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
  } = useSortable({ id: field.field_id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
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
        <Text size="sm">
          {column?.display_name || field.field_id}
        </Text>
      </Group>
    </Box>
  );
}

interface Section {
  id: number;
  title: string;
  direction: "horizontal" | "vertical";
  fields: Array<{
    field_id: string;
    style: "normal" | "bold" | "dim" | "title";
  }>;
}

interface DetailViewSidebarProps {
  columns: DatasetColumn[];
  sections: Section[];
  hasRelationships: boolean;
  relationshipsDirection: "horizontal" | "vertical";
  onUpdateRelationshipsDirection: (direction: "horizontal" | "vertical") => void;
  onCreateSection: (options?: { position?: "start" | "end" }) => void;
  onUpdateSection: (sectionId: string, update: Partial<Section>) => void;
  onUpdateSections: (sections: Section[]) => void;
  onRemoveSection: (sectionId: number) => void;
  onDragEnd: (event: any) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function DetailViewSidebar({
  columns,
  sections,
  hasRelationships,
  relationshipsDirection,
  onUpdateRelationshipsDirection,
  onCreateSection,
  onUpdateSection,
  onUpdateSections,
  onRemoveSection,
  onDragEnd,
  onCancel,
  onSubmit,
}: DetailViewSidebarProps) {
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const shouldKeepOpenRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <Stack gap={0} h="100%">
      <Box
        flex="0 0 auto"
        px="xl"
        py="lg"
        style={{
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <Text fw={600} size="lg">{t`Detail view settings`}</Text>
      </Box>

      <Box flex="1" px="xl" pb="xl" pt={16} style={{ overflow: "auto" }}>
        <Stack gap="lg">
          <Box>
            <Group justify="space-between" align="center" mb="md">
              <Text fw={600}>{t`Sections`}</Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<Icon name="add" />}
                onClick={() => onCreateSection({ position: "end" })}
              >
                {t`Add section`}
              </Button>
            </Group>
            <Stack gap="sm">
              {sections.map((section, _index) => {
                return (
                  <>
                    <Text fw={500} size="sm">{section.title}</Text>
                    <Box
                      key={section.id}
                      p="md"
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--default-border-radius)",
                        backgroundColor: "var(--mb-color-bg-white)",
                      }}
                    >
                      <Group justify="space-between" align="flex-start">
                        <Stack gap="xs" flex="1">
                          <Box pos="relative">
                            <Text
                              size="xs"
                              c={section.fields.length === 0 ? "text-light" : "text-medium"}
                              style={{
                                cursor: section.fields.length === 0 ? "default" : "pointer",
                                opacity: section.fields.length === 0 ? 0.5 : 1
                              }}
                              onClick={() => {
                                if (section.fields.length > 0) {
                                  // Toggle dropdown only on explicit click
                                  if (openPopoverId === section.id) {
                                    setOpenPopoverId(null);
                                  } else {
                                    setOpenPopoverId(section.id);
                                  }
                                }
                              }}
                            >
                              {section.fields.length} {t`fields`}
                            </Text>

                            {openPopoverId === section.id && section.fields.length > 0 && (
                              <Box
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
                                }}
                                p="md"
                              >
                                <Text fw={600} mb="sm">{t`Fields in ${section.title}`}</Text>
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragStart={() => {
                                    isDraggingRef.current = true;
                                    shouldKeepOpenRef.current = true;
                                  }}
                                  onDragEnd={(event) => {
                                    isDraggingRef.current = false;
                                    // Keep the dropdown open after drag ends
                                    setTimeout(() => {
                                      shouldKeepOpenRef.current = false;
                                    }, 100);
                                    const { active, over } = event;
                                    if (over && active.id !== over.id) {
                                      const oldIndex = section.fields.findIndex(field => field.field_id === active.id);
                                      const newIndex = section.fields.findIndex(field => field.field_id === over.id);
                                      if (oldIndex !== -1 && newIndex !== -1) {
                                        const newFields = [...section.fields];
                                        const [movedField] = newFields.splice(oldIndex, 1);
                                        newFields.splice(newIndex, 0, movedField);
                                        onUpdateSection(section.id.toString(), { fields: newFields });
                                      }
                                    }
                                  }}
                                >
                                  <SortableContext
                                    items={section.fields.map(field => field.field_id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <Stack gap="xs">
                                      {section.fields.map((field, _fieldIndex) => {
                                        const column = columns.find((col: DatasetColumn) => String(col.id) === field.field_id);

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
                              </Box>
                            )}
                          </Box>
                        </Stack>
                        {/* {sections.length > 1 && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => onRemoveSection(section.id)}
                          >
                            {t`Remove`}
                          </Button>
                        )} */}
                      </Group>
                    </Box>
                  </>
                );
              })}
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Box
        flex="0 0 auto"
        bg="white"
        px="xl"
        py="md"
        style={{
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Button size="sm" variant="subtle" onClick={onCancel}>
              {t`Cancel`}
            </Button>
          </Group>

          <Button size="sm" type="submit" variant="filled" onClick={onSubmit}>
            {t`Save`}
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}
