import { useRef } from "react";
import { useDrag } from "react-dnd";

import { Button } from "metabase/ui";

import type { DataAppWidgetButton } from "../canvas-types";

export const ButtonWidget = ({ widget }: { widget: DataAppWidgetButton }) => {
  const ref = useRef(null);

  const [{ isDragging }, drag] = useDrag({
    item: { type: widget.type, id: widget.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(ref);

  return (
    <Button ref={ref} style={{ opacity }} className="draggable">
      {widget.options.text}
    </Button>
  );
};
