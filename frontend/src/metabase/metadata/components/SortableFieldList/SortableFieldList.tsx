import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";

import {
  type DragEndEvent,
  SortableList,
} from "metabase/core/components/Sortable";
import { Flex } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { SortableField } from "../SortableField";

import { getId, getItems, getItemsOrder, sortItems } from "./utils";

interface Props {
  table: Table;
  onChange: (fieldOrder: DragEndEvent["itemIds"]) => void;
  onFieldClick?: (fieldId: FieldId) => void;
}

export const SortableFieldList = ({ table, onChange, onFieldClick }: Props) => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });
  const items = useMemo(() => getItems(table), [table]);
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
            onClick={onFieldClick}
          />
        )}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </Flex>
  );
};
