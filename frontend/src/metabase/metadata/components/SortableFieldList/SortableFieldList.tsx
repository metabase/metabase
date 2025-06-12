import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import { Stack, rem } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { SortableFieldItem } from "../SortableFieldItem";

import { getId, getItems, sortItems } from "./utils";

interface Props {
  activeFieldId?: FieldId;
  table: Table;
  onChange: (fieldOrder: DragEndEvent["itemIds"]) => void;
}

export const SortableFieldList = ({
  activeFieldId,
  table,
  onChange,
}: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const items = useMemo(() => getItems(table), [table]);
  const sortedItems = useMemo(() => sortItems(items), [items]);
  const isDragDisabled = sortedItems.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onChange(itemIds);
  };

  return (
    <Stack gap={rem(12)}>
      <SortableList
        getId={getId}
        items={sortedItems}
        renderItem={({ item, id }) => (
          <SortableFieldItem
            active={item.id === activeFieldId}
            disabled={isDragDisabled}
            icon={item.icon}
            id={id}
            key={id}
            label={item.label}
          />
        )}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </Stack>
  );
};
