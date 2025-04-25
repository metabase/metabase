import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import { SortableField } from "metabase/metadata/components";
import { Flex } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { getId, getItems, getItemsOrder, sortItems } from "./utils";

interface Props {
  table: Table;
  onChange: (fieldOrder: DragEndEvent["itemIds"]) => void;
}

export const FieldOrder = ({ table, onChange }: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const initialItems = useMemo(() => getItems(table?.fields), [table?.fields]);
  const initialOrder = useMemo(
    () => getItemsOrder(initialItems),
    [initialItems],
  );
  const [items, setItems] = useState(initialItems);
  const [order, setOrder] = useState(initialOrder);
  const sortedItems = useMemo(() => sortItems(items, order), [items, order]);
  const isDragDisabled = sortedItems.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    setOrder(itemIds);
    onChange(itemIds);
  };

  useDeepCompareEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  useDeepCompareEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  return (
    <Flex direction="column" gap="sm">
      <SortableList
        getId={getId}
        items={sortedItems}
        renderItem={({ item, id }) => (
          <SortableField
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
    </Flex>
  );
};
