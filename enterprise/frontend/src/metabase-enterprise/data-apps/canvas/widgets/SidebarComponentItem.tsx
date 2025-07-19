import { useMemo, useRef } from "react";
import { useDrag } from "react-dnd";

import { uuid } from "metabase/lib/uuid";
import { Card, Text } from "metabase/ui";

import type { DataAppWidget } from "../canvas-types";

export const SidebarComponentItem = ({
  title,
  widget,
}: {
  title: string;
  widget: Omit<DataAppWidget, "id">;
}) => {
  const ref = useRef(null);

  const newWidgetId = useMemo(uuid, []);

  const [{ isDragging }, drag] = useDrag({
    item: { ...widget, id: newWidgetId, fromSidebar: true },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(ref);

  return (
    <Card ref={ref} style={{ opacity }} className="draggable">
      <Text fw={500}>{title}</Text>
    </Card>
  );
};
