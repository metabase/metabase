import { t } from "ttag";

import { Box, Stack, Text } from "metabase/ui";
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
  return (
    <Stack gap={0} p="sm">
      <Text c="text-secondary" p="xs" >
        {t`Recents`}
      </Text>
      <Box mah={400} className={S.listbox}>
        {recents.map((item) => (
          <MetricResultItem
            key={item.id}
            name={item.name}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </Box>
    </Stack>
  );
}
