import { useMemo } from "react";

import { Box, Text } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { ResultItem, ChunkyList } from "../ResultItem";

import { getRecentGroups, recentItemToResultItem } from "./utils";

export function GroupedRecentsList({
  items,
  onItemSelect,
  isSelectedItem,
}: {
  items: RecentItem[];
  onItemSelect: (item: RecentItem) => void;
  isSelectedItem: (item: RecentItem) => boolean;
}) {
  const recentGroups = useMemo(() => getRecentGroups(items), [items]);

  return (
    <Box style={{ overflowY: "auto" }} p="xl">
      {recentGroups.map(group => (
        <RecentSection
          key={group.title}
          title={group.title}
          items={group.items}
          onItemSelect={onItemSelect}
          isSelectedItem={isSelectedItem}
        />
      ))}
    </Box>
  );
}

function RecentSection({
  title,
  items,
  onItemSelect,
  isSelectedItem,
}: {
  title: string;
  items: RecentItem[];
  onItemSelect: (item: RecentItem) => void;
  isSelectedItem: (item: RecentItem) => boolean;
}) {
  if (!items?.length) {
    return null;
  }
  return (
    <Box pb="lg">
      <Text fw="bold" color="text-light" mb="sm" pl="xs">
        {title}
      </Text>
      <ChunkyList>
        {items.map((item, index) => (
          <ResultItem
            key={item.model + item.id}
            item={recentItemToResultItem(item)}
            onClick={() => onItemSelect(item)}
            isSelected={isSelectedItem(item)}
            isLast={index === items.length - 1}
          />
        ))}
      </ChunkyList>
    </Box>
  );
}
