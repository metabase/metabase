import { useRef } from "react";
import { useDrag } from "react-dnd";

import { Text } from "metabase/ui";

import type { DataAppWidgetText } from "../canvas-types";

export const TextWidget = ({ widget }: { widget: DataAppWidgetText }) => {
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
    <Text ref={ref} style={{ opacity }} className="draggable">
      {widget.options.text}
    </Text>
  );
};
