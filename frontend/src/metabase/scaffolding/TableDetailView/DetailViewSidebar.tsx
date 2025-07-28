import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CollapseSection from "metabase/common/components/CollapseSection";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  type IconName,
  Menu,
  Portal,
  Text,
} from "metabase/ui/components";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import S from "./TableDetailView.module.css";

interface DetailViewSidebarProps {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  onUpdateSection: (
    id: number,
    section: Partial<ObjectViewSectionSettings>,
  ) => void;
}

const HIDDEN_COLUMNS_ID = "hidden-columns";

export function DetailViewSidebar({
  sections,
  columns,
  onUpdateSection,
}: DetailViewSidebarProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const visibleColumnIds = useMemo(
    () =>
      sections.flatMap((section) =>
        section.fields.map((field) => field.field_id),
      ),
    [sections],
  );

  const [visibleColumns, hiddenColumns] = _.partition(columns, (column) =>
    visibleColumnIds.includes(column.id as number),
  );

  const activeColumn = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return columns.find((col) => col.id === activeId);
  }, [activeId, columns]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeFieldId = active.id as number;
    const overId = over.id;

    // Find which container the active item is in
    const activeContainer = findContainer(activeFieldId, sections);
    const overContainer = over.data.current?.sortable?.containerId || overId;

    if (activeContainer !== overContainer) {
      // Moving between containers

      // First, remove the field from ALL sections to prevent duplicates
      const updatedSections = sections.map((section) => ({
        ...section,
        fields: section.fields.filter((f) => f.field_id !== activeFieldId),
      }));

      if (overContainer === HIDDEN_COLUMNS_ID) {
        // Moving to hidden - just remove from all sections
        updatedSections.forEach((section, index) => {
          if (sections[index].fields.length !== section.fields.length) {
            onUpdateSection(section.id, { fields: section.fields });
          }
        });
      } else {
        // Moving to a section
        const targetSectionId = Number(overContainer);
        const targetSectionIndex = updatedSections.findIndex(
          (s) => s.id === targetSectionId,
        );

        if (targetSectionIndex !== -1) {
          // Find the active field or create it if dragging from hidden
          let activeField = sections
            .find((s) => s.fields.some((f) => f.field_id === activeFieldId))
            ?.fields.find((f) => f.field_id === activeFieldId);

          if (!activeField) {
            // Dragging from hidden columns - create a new field
            activeField = {
              field_id: activeFieldId,
              style: "normal" as const,
            };
          }

          const newField = {
            ...activeField,
          };

          const targetSection = updatedSections[targetSectionIndex];
          const newFields = [...targetSection.fields];

          if (overId !== overContainer && typeof overId === "number") {
            // Insert at specific position
            const overIndex = newFields.findIndex((f) => f.field_id === overId);
            if (overIndex !== -1) {
              newFields.splice(overIndex + 1, 0, newField);
            } else {
              newFields.push(newField);
            }
          } else {
            // Add to end
            newFields.push(newField);
          }

          // Update all sections that changed
          updatedSections.forEach((section, index) => {
            if (section.id === targetSectionId) {
              onUpdateSection(section.id, { fields: newFields });
            } else if (
              sections[index].fields.length !== section.fields.length
            ) {
              onUpdateSection(section.id, { fields: section.fields });
            }
          });
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    const activeFieldId = active.id as number;
    const overFieldId = over.id as number;

    // Handle reordering within the same container
    const activeContainer = findContainer(activeFieldId, sections);
    const overContainer =
      over.data.current?.sortable?.containerId ||
      findContainer(overFieldId, sections);

    if (
      activeContainer === overContainer &&
      activeContainer !== HIDDEN_COLUMNS_ID
    ) {
      const sectionId = Number(activeContainer);
      const section = sections.find((s) => s.id === sectionId);

      if (section) {
        const oldIndex = section.fields.findIndex(
          (f) => f.field_id === activeFieldId,
        );
        const newIndex = section.fields.findIndex(
          (f) => f.field_id === overFieldId,
        );

        if (oldIndex !== -1 && newIndex !== -1) {
          const newFields = arrayMove(section.fields, oldIndex, newIndex);
          onUpdateSection(sectionId, { fields: newFields });
        }
      }
    }

    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box
        style={{
          width: 280,
          borderLeft: `1px solid var(--mb-border-color)`,
          padding: 16,
          background: "var(--mb-bg-white)",
          overflowY: "auto",
        }}
      >
        <Text
          fw={600}
          size="lg"
          mb="xs"
          pb="sm"
        >{t`Detail view settings`}</Text>

        {sections.map((section) => (
          <SectionSettings
            key={section.id}
            columns={visibleColumns}
            section={section}
            onUpdateSection={(update) => onUpdateSection(section.id, update)}
          />
        ))}

        <Box mt="md">
          <SortableContext
            id={HIDDEN_COLUMNS_ID}
            items={hiddenColumns.map((column) => column.id as number)}
            strategy={verticalListSortingStrategy}
          >
            <CollapseSection
              header={<Text fw={600}>{t`Hidden columns`}</Text>}
              initialState="expanded"
            >
              <Box
                style={{
                  minHeight: hiddenColumns.length === 0 ? 40 : undefined,
                  border:
                    hiddenColumns.length === 0
                      ? "1px dashed var(--mb-border-color)"
                      : undefined,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {hiddenColumns.length === 0 ? (
                  <EmptyDropZone
                    sectionId={HIDDEN_COLUMNS_ID}
                    message={t`Drop columns here to hide them`}
                  />
                ) : (
                  <ul style={{ width: "100%" }}>
                    {hiddenColumns.map((column) => (
                      <ColumnListItem key={column.id} column={column} />
                    ))}
                  </ul>
                )}
              </Box>
            </CollapseSection>
          </SortableContext>
        </Box>
      </Box>

      <Portal>
        <DragOverlay>
          {activeId && activeColumn ? (
            <Group
              style={{
                background: "var(--mb-bg-white)",
                padding: "8px 12px",
                borderRadius: 4,
                cursor: "grabbing",
                opacity: 0.85,
              }}
            >
              <Icon
                name={getIconForField(activeColumn) as IconName}
                size={14}
              />
              <Text size="sm">{activeColumn.display_name}</Text>
            </Group>
          ) : null}
        </DragOverlay>
      </Portal>
    </DndContext>
  );
}

type SectionSettingsProps = {
  columns: DatasetColumn[];
  section: ObjectViewSectionSettings;
  onUpdateSection: (update: Partial<ObjectViewSectionSettings>) => void;
};

function SectionSettings({
  columns,
  section,
  onUpdateSection,
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
    <Box mt="sm">
      <CollapseSection
        header={
          <Flex align="center" justify="space-between" w="100%">
            <Text display="inline-block" fw="bold">
              {section.title}
            </Text>
            <Button
              variant="outline"
              size="compact-xs"
              onClick={() =>
                onUpdateSection({
                  direction:
                    section.direction === "vertical"
                      ? "horizontal"
                      : "vertical",
                })
              }
            >
              {section.direction === "vertical" ? "→" : "↓"}
            </Button>
          </Flex>
        }
        initialState="expanded"
      >
        {columnIds.length === 0 ? (
          <EmptyDropZone sectionId={String(section.id)} />
        ) : (
          <SortableContext
            id={String(section.id)}
            items={columnIds}
            strategy={verticalListSortingStrategy}
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
                      onChangeFieldSettings={(update) =>
                        handleUpdateField(fieldSettings.field_id, update)
                      }
                      onHideField={() =>
                        handleHideField(fieldSettings.field_id)
                      }
                    />
                  );
                })}
              </ul>
            </Box>
          </SortableContext>
        )}
      </CollapseSection>
    </Box>
  );
}

function ColumnListItem({
  column,
  onChangeFieldSettings,
  onHideField,
}: {
  column: DatasetColumn;
  onChangeFieldSettings?: (update: {
    style: "normal" | "bold" | "dim" | "title";
  }) => void;
  onHideField?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id as number });

  return (
    <Box
      component="li"
      className={S.ObjectViewSidebarColumn}
      mt="sm"
      style={{
        transition,
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
      ref={setNodeRef}
    >
      <Flex align="center" justify="space-between">
        <Group gap="sm">
          <Icon
            name="grabber"
            className={S.ObjectViewSidebarColumnActionIcon}
            style={{ cursor: "grab" }}
            {...attributes}
            {...listeners}
          />
          <Icon name={getIconForField(column) as IconName} />
          <Text>{column.display_name}</Text>
        </Group>
        <Group gap="sm">
          {!!onHideField && (
            <ActionIcon
              className={S.ObjectViewSidebarColumnActionIcon}
              variant="transparent"
              color="text-medium"
              onClick={onHideField}
            >
              <Icon name="eye_crossed_out" />
            </ActionIcon>
          )}
          {!!onChangeFieldSettings && (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  className={S.ObjectViewSidebarColumnActionIcon}
                  aria-label={t`Change style`}
                  variant="transparent"
                  color="text-medium"
                >
                  <Icon name="string" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  onClick={() => onChangeFieldSettings({ style: "normal" })}
                >{t`Normal`}</Menu.Item>
                <Menu.Item
                  onClick={() => onChangeFieldSettings({ style: "bold" })}
                >{t`Bold`}</Menu.Item>
                <Menu.Item
                  onClick={() => onChangeFieldSettings({ style: "dim" })}
                >{t`Dim`}</Menu.Item>
                <Menu.Item
                  onClick={() => onChangeFieldSettings({ style: "title" })}
                >{t`Title`}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Flex>
    </Box>
  );
}

function findContainer(
  fieldId: UniqueIdentifier,
  sections: ObjectViewSectionSettings[],
): string {
  for (const section of sections) {
    if (section.fields.some((f) => f.field_id === fieldId)) {
      return String(section.id);
    }
  }
  return HIDDEN_COLUMNS_ID;
}

function EmptyDropZone({
  sectionId,
  message = t`Drop columns here`,
}: {
  sectionId: string;
  message?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: sectionId,
  });

  return (
    <Box
      ref={setNodeRef}
      mt="sm"
      style={{
        minHeight: 40,
        border: `1px dashed ${isOver ? "var(--mb-brand)" : "var(--mb-border-color)"}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isOver ? "var(--mb-bg-light)" : undefined,
        transition: "all 0.2s",
      }}
    >
      <Text c="text-light">{message}</Text>
    </Box>
  );
}
