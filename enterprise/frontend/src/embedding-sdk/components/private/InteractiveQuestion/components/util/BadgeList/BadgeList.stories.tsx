import { useState } from "react";

import { Box, Stack } from "metabase/ui";

import { BadgeList } from "./BadgeList";

export default {
  title: "BadgeList",
  component: BadgeList,
  parameters: {
    layout: "fullscreen",
  },
};

export const DefaultLayoutBadgeList = {
  render() {
    const [items, setItems] = useState(
      Array.from(Array(5).keys()).map(i => ({
        name: `item ${i}`,
        item: i,
      })),
    );

    const [selectedItem, setSelectedItem] = useState<{
      item?: number;
      index?: number;
    }>({});

    const onSelectItem = (item?: number, index?: number) => {
      if (item === selectedItem?.item) {
        setSelectedItem({});
      } else {
        setSelectedItem({ item, index });
      }
    };

    const onAddItem = () =>
      setItems(nextItems => [
        ...nextItems,
        { name: `item ${nextItems.length}`, item: nextItems.length },
      ]);

    const onRemoveItem = (_item?: number, index?: number) => {
      if (typeof index === "number") {
        setItems(nextItems => [
          ...nextItems.slice(0, index),
          ...nextItems.slice(index + 1),
        ]);
      }
    };

    return (
      <Stack>
        <BadgeList
          items={items}
          onSelectItem={onSelectItem}
          onAddItem={onAddItem}
          onRemoveItem={onRemoveItem}
          addButtonLabel="Add another item"
        />
        <Box p="md">
          {selectedItem?.item
            ? `The selected element is ${selectedItem.item} at index ${selectedItem.index}`
            : "No element has been selected"}
        </Box>
      </Stack>
    );
  },
};
