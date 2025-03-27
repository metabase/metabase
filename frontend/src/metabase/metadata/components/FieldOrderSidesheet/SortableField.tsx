import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import Grabber from "metabase/components/Grabber";
import type Field from "metabase-lib/v1/metadata/Field";

interface Props {
  field: Field;
  id: UniqueIdentifier;
}

export const SortableField = ({ field, id }: Props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dragHandle = (
    <Grabber style={{ width: 10 }} {...attributes} {...listeners} />
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 100 : 1,
      }}
    >
      {field.displayName()}
    </div>
  );
};
