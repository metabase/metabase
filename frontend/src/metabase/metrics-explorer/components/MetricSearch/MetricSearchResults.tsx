import { useState } from "react";
import { t } from "ttag";

import { Box, Group, Skeleton, Stack, Text } from "metabase/ui";
import type { CardId, ConcreteTableId, MeasureId, SearchResult } from "metabase-types/api";

import { MetricResultItem } from "./MetricResultItem";
import S from "./MetricSearchResults.module.css";

type MetricSearchResultsProps = {
  metricResults: SearchResult<CardId, "metric">[];
  measureResults: SearchResult<MeasureId, "measure">[];
  isLoading: boolean;
  onSelectMetric: (metricId: CardId) => void;
  onSelectMeasure: (measureId: MeasureId, tableId: ConcreteTableId) => void;
};

export function MetricSearchResults({
  metricResults,
  measureResults,
  isLoading,
  onSelectMetric,
  onSelectMeasure,
}: MetricSearchResultsProps) {
  const [activeIndex, setActiveIndex] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Stack my="2rem" mx="2rem">
        <Skeleton height={20} radius={4} />
        <Skeleton height={20} mt={16} radius={4} />
        <Skeleton height={20} w="80%" mt={16} radius={4} />
        <Skeleton height={20} w="60%" mt={16} radius={4} />
      </Stack>
    );
  }

  if (metricResults.length === 0 && measureResults.length === 0) {
    return (
      <Box p="xl">
        <Text c="text-secondary" ta="center">
          {t`No results found`}
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap={0}>
      {metricResults.length > 0 && (
        <>
          <Group fz="14px" px="lg" pt="md" pb="sm">
            <Text c="text-secondary" fw={700}>
              {t`Metrics`}
            </Text>
          </Group>
          <Box
            role="listbox"
            pb="sm"
            mah={200}
            className={S.listbox}
          >
            {metricResults.map((item) => {
              const key = `metric-${item.id}`;
              return (
                <Box
                  key={key}
                  role="option"
                  aria-selected={activeIndex === key}
                  onPointerMove={() => setActiveIndex(key)}
                  onPointerLeave={() => setActiveIndex(null)}
                >
                  <MetricResultItem
                    name={item.name}
                    description={item.description ?? undefined}
                    icon="metric"
                    active={activeIndex === key}
                    onClick={() => onSelectMetric(item.id)}
                  />
                </Box>
              );
            })}
          </Box>
        </>
      )}

      {measureResults.length > 0 && (
        <>
          <Group fz="14px" px="lg" pt="md" pb="sm">
            <Text c="text-secondary" fw={700}>
              {t`Measures`}
            </Text>
          </Group>
          <Box
            role="listbox"
            pb="sm"
            mah={200}
            className={S.listbox}
          >
            {measureResults.map((item) => {
              const key = `measure-${item.id}`;
              return (
                <Box
                  key={key}
                  role="option"
                  aria-selected={activeIndex === key}
                  onPointerMove={() => setActiveIndex(key)}
                  onPointerLeave={() => setActiveIndex(null)}
                >
                  <MetricResultItem
                    name={item.name}
                    description={item.description ?? undefined}
                    icon="sum"
                    tableName={item.table_name}
                    active={activeIndex === key}
                    onClick={() => onSelectMeasure(item.id, item.table_id as ConcreteTableId)}
                  />
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Stack>
  );
}
