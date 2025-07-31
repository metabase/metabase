import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CollapseSection from "metabase/common/components/CollapseSection/CollapseSection";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  type IconName,
  Portal,
  Text,
} from "metabase/ui/components";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import { ColumnListItem } from "./ColumnListItem";
import { Dnd } from "./Dnd";
import { EmptyDropZone } from "./EmptyDropZone";
import { RelationshipsSectionSettings } from "./RelationshipsSectionSettings";
import { SortableSectionSettings } from "./SortableSectionSettings";

interface DetailViewSidebarProps {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  hasRelationships?: boolean;
  relationshipsDirection?: "horizontal" | "vertical";
  onUpdateRelationshipsDirection?: (
    direction: "horizontal" | "vertical",
  ) => void;
  onCreateSection: () => void;
  onUpdateSection: (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
  onRemoveSection: (id: number) => void;
  onDragEnd: (event: any) => void;
}

const HIDDEN_COLUMNS_ID = "hidden-columns";

export function DetailViewSidebar({
  columns,
  sections,
  hasRelationships,
  relationshipsDirection = "vertical",
  onUpdateRelationshipsDirection,
  onCreateSection,
  onUpdateSection,
  onRemoveSection,
  onDragEnd,
}: DetailViewSidebarProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [isDraggingSection, setIsDraggingSection] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
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
    // Check if we're dragging a section (sections have larger IDs that are timestamps)
    const isSection = sections.some(
      (section) => section.id === event.active.id,
    );
    setIsDraggingSection(isSection);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    // Check if we're dragging a section (sections have larger IDs that are timestamps)
    const isSection = sections.some((section) => section.id === active.id);
    if (isSection) {
      onDragEnd(event);
      setActiveId(null);
      setIsDraggingSection(false);
      return;
    }

    const activeFieldId = active.id as number;
    const overFieldId = over.id as number;

    // Find which container the active item is in
    const activeContainer = findContainer(activeFieldId, sections);
    const overContainer =
      over.data.current?.sortable?.containerId || overFieldId;

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

          if (
            overFieldId !== overContainer &&
            typeof overFieldId === "number"
          ) {
            // Insert at specific position
            const overIndex = newFields.findIndex(
              (f) => f.field_id === overFieldId,
            );
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
    } else {
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
      setIsDraggingSection(false);
    }
  };

  const handleUnhideField = (fieldId: number) => {
    // TODO: support any section, not just the first one
    if (sections.length > 0) {
      const firstSection = sections[0];
      const newField = {
        field_id: fieldId,
        style: "normal" as const,
      };

      const newFields = [...firstSection.fields, newField];
      onUpdateSection(firstSection.id, { fields: newFields });
    }
  };

  return <Dnd />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Box>
        <SortableContext
          items={sections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section) => (
            <SortableSectionSettings
              key={section.id}
              columns={visibleColumns}
              section={section}
              onUpdateSection={(update) => onUpdateSection(section.id, update)}
              onRemoveSection={
                sections.length > 1
                  ? () => onRemoveSection(section.id)
                  : undefined
              }
              isDraggingSection={isDraggingSection}
            />
          ))}
        </SortableContext>

        {hasRelationships && (
          <RelationshipsSectionSettings
            direction={relationshipsDirection}
            onUpdateDirection={onUpdateRelationshipsDirection || (() => {})}
          />
        )}

        {onCreateSection && (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<Icon name="add" />}
            mt="md"
            onClick={onCreateSection}
          >{t`Add group`}</Button>
        )}

        <Divider mt="lg" mb="sm" />

        <CollapseSection
          header={<Text fw={600}>{t`Hidden columns`}</Text>}
          initialState="collapsed"
        >
          <Box>
            <SortableContext
              id={HIDDEN_COLUMNS_ID}
              items={hiddenColumns.map((column) => column.id as number)}
              strategy={verticalListSortingStrategy}
            >
              {hiddenColumns.length === 0 ? (
                <EmptyDropZone
                  sectionId={HIDDEN_COLUMNS_ID}
                  message={t`Drop columns here to hide them`}
                />
              ) : (
                <ul style={{ width: "100%" }}>
                  {hiddenColumns.map((column) => (
                    <ColumnListItem
                      key={column.id}
                      column={column}
                      onUnhideField={() =>
                        handleUnhideField(column.id as number)
                      }
                    />
                  ))}
                </ul>
              )}
            </SortableContext>
          </Box>
        </CollapseSection>
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
