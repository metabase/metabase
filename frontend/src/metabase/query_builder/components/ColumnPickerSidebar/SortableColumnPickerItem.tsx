import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

import {
  ColumnPickerItem,
  type ColumnPickerItemProps,
} from "./ColumnPickerItem";

function SortableColumnPickerItem(
  props: Omit<ColumnPickerItemProps, "handle" | "style">,
) {
  const { item } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.columnInfo.longDisplayName,
  });

  const Handle = () => {
    return (
      <ActionIcon
        size="sm"
        variant="subtle"
        {...listeners}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        aria-label={t`Drag to reorder`}
      >
        <Icon name="grabber" />
      </ActionIcon>
    );
  };

  return (
    <ColumnPickerItem
      {...props}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      handle={<Handle />}
    />
  );
}

export { SortableColumnPickerItem };
