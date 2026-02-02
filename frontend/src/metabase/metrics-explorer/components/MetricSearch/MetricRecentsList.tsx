import { useState } from "react";
import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import S from "./MetricRecentsList.module.css";
import { MetricResultItem } from "./MetricResultItem";

type MetricRecentsListProps = {
  recents: RecentItem[];
  onSelect: (metricId: number) => void;
};

export function MetricRecentsList({
  recents,
  onSelect,
}: MetricRecentsListProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <Stack gap={0}>
      <Group fz="14px" px="lg" pt="md" pb="sm">
        <Text c="text-secondary" fw={700}>
          {t`Recent metrics`}
        </Text>
      </Group>
      <Box
        role="listbox"
        pb="sm"
        mah={400}
        className={S.listbox}
      >
        {recents.map((item, index) => (
          <Box
            key={item.id}
            role="option"
            aria-selected={activeIndex === index}
            onPointerMove={() => setActiveIndex(index)}
            onPointerLeave={() => setActiveIndex(null)}
          >
            <MetricResultItem
              name={item.name}
              description={item.description ?? undefined}
              active={activeIndex === index}
              onClick={() => onSelect(item.id)}
            />
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
