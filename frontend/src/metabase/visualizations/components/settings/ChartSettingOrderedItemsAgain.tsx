import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

import { Sortable } from "metabase/core/components/Sortable";

export const ChartSettingOrderedItemsAgain = ({ items, onSortEnd }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );
  return (
    <DndContext sensors={sensors} onDragEnd={onSortEnd}>
      <SortableContext items={items.map(item => item.id)}>
        {items.map(item => (
          <Sortable key={item.id} id={item.id}>
            {item.element}
          </Sortable>
        ))}
      </SortableContext>
    </DndContext>
  );
};
