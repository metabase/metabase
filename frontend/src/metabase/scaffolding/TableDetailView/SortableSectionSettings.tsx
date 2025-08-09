import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { SectionSettings, type SectionSettingsProps } from "./SectionSettings";

export function SortableSectionSettings(
  props: Omit<SectionSettingsProps, "dragHandleProps">,
) {
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
      <SectionSettings
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDraggingSection={props.isDraggingSection}
      />
    </div>
  );
}
