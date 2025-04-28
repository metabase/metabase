import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { SortableField } from "../SortableField";

import { getId, getItems, getItemsOrder, sortItems } from "./utils";

interface Props {
  table: Table;
  onChange: (fieldOrder: DragEndEvent["itemIds"]) => void;
}

export const SortableFieldList = ({ table, onChange }: Props) => {
  const metadata = useSelector(getMetadata);
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const items = useMemo(() => getItems(metadata, table), [metadata, table]);
  const order = useMemo(() => getItemsOrder(items), [items]);
  const sortedItems = useMemo(() => sortItems(items, order), [items, order]);
  const isDragDisabled = sortedItems.length <= 1;

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onChange(itemIds);
  };

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
