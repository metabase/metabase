import { Group, Paper } from "metabase/ui";

import { AddBadgeListItem } from "./AddBadgeListItem";
import { BadgeListItem } from "./BadgeListItem";

type BadgeList<T> = {
  items: {
    name: string;
    item: T;
  }[];
  onSelectItem?: (item?: T) => void;
  onAddItem?: (item?: T) => void;
  onRemoveItem?: (item?: T) => void;
  addButtonLabel?: string;
};

export const BadgeList = <T,>({
  items,
  onSelectItem,
  onAddItem,
  onRemoveItem,
  addButtonLabel,
}: BadgeList<T>) => (
  <Paper p="md" w="30rem">
    <Group spacing="sm">
      {items.map(({ name, item }) => (
        <BadgeListItem
          key={name}
          onSelectItem={() => onSelectItem?.(item)}
          onRemoveItem={() => onRemoveItem?.(item)}
          name={name}
        />
      ))}
      {addButtonLabel && (
        <AddBadgeListItem name={addButtonLabel} onClick={() => onAddItem?.()} />
      )}
    </Group>
  </Paper>
);
