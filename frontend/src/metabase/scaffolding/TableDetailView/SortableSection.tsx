import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  TableId,
} from "metabase-types/api";

import { ObjectViewSection } from "./ObjectViewSection";

type SortableSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
};

export function SortableSection(props: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.section.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ObjectViewSection
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
