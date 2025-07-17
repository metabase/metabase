import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type React from "react";

import { Button, Flex } from "metabase/ui";

import type {
  DataAppWidgetButton,
  DataAppWidgetSection,
  WidgetId,
} from "../../types";

export function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export const WIDGET_COMPONENTS_MAP = {
  section: ({
    widget,
    renderCanvasComponent,
  }: {
    widget: DataAppWidgetSection;
    renderCanvasComponent: (componentId: WidgetId) => React.ReactNode;
  }) => (
    <SortableContext items={widget.childrenIds}>
      <Flex
        data-section-id={widget.id}
        p="1rem"
        justify="stretch"
        style={{
          flexBasis: `${widget.options.width / 3}`,
          minWidth: "10rem",
          minHeight: "10rem",
          border: "1px solid var(--mb-color-border)",
          // eslint-disable-next-line no-color-literals
          background: "rgba(0,0,0, 0.1)",
        }}
      >
        {widget.childrenIds.map((id) => (
          <SortableItem key={id} id={id}>
            {renderCanvasComponent(id)}
          </SortableItem>
        ))}
      </Flex>
    </SortableContext>
  ),

  button: ({ widget }: { widget: DataAppWidgetButton }) => (
    <Button>{widget.options.text}</Button>
  ),
};
