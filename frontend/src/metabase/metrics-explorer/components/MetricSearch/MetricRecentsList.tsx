import type { RefObject } from "react";
import { t } from "ttag";

import { Box, Stack, Text } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import S from "./MetricRecentsList.module.css";
import { MetricResultItem } from "./MetricResultItem";

type MetricRecentsListProps = {
  recents: RecentItem[];
  cursorIndex?: number | null;
  getRef?: (item: RecentItem) => RefObject<HTMLElement> | undefined;
  onSelect: (metricId: number) => void;
};

export function MetricRecentsList({
  recents,
  cursorIndex,
  getRef,
  onSelect,
}: MetricRecentsListProps) {
  return (
    <Stack gap={0} p="sm">
      <Text c="text-secondary" p="xs" >
        {t`Recents`}
      </Text>
      <Box mah={400} className={S.listbox}>
        {recents.map((item, index) => (
          <MetricResultItem
            key={item.id}
            ref={getRef?.(item)}
            name={item.name}
            active={cursorIndex === index}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </Box>
    </Stack>
  );
}
