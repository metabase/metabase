import { Group, Paper } from "metabase/ui";

import { AddBadgeListItem } from "./AddBadgeListItem";
import { BadgeListItem } from "./BadgeListItem";

export type BadgeListProps<T> = {
  items: {
    name: string;
    item: T;
  }[];
  onSelectItem?: (item: T, index: number) => void;
  onAddItem?: (item?: T) => void;
  onRemoveItem?: (item: T, index: number) => void;
  addButtonLabel?: string;
};

export const BadgeList = <T,>({
  items,
  onSelectItem,
  onAddItem,
  onRemoveItem,
  addButtonLabel,
}: BadgeListProps<T>) => (
  <Paper p="md" w="30rem">
    <Group spacing="sm">
      {items.map(({ name, item }, index) => (
        <BadgeListItem
          key={`${name}/${index}`}
          onClick={() => onSelectItem?.(item, index)}
          onRemoveItem={() => onRemoveItem?.(item, index)}
          name={name}
        />
      ))}
      {addButtonLabel && (
        <AddBadgeListItem name={addButtonLabel} onClick={() => onAddItem?.()} />
      )}
    </Group>
  </Paper>
);
