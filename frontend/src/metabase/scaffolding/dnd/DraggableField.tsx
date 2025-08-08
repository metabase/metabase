import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Group } from "metabase/ui";

import { DragHandle } from "../TableDetailView/DragHandle";

import { Field, type FieldProps } from "./Field";
import { getFieldDraggableKey } from "./utils";

type DraggableFieldProps = FieldProps & {
  isDraggable: boolean;
};

export function DraggableField({
  field_id,
  columns,
  section,
  row,
  isDraggable,
}: DraggableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getFieldDraggableKey({ field_id }),
  });

  if (isDraggable) {
    return (
      <Group
        ref={setNodeRef}
        wrap="nowrap"
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        <DragHandle {...attributes} {...listeners} />
        <Field
          field_id={field_id}
          columns={columns}
          section={section}
          row={row}
        />
      </Group>
    );
  }
  return (
    <Field field_id={field_id} columns={columns} section={section} row={row} />
  );
}
