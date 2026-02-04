import type { RefObject } from "react";
import { t } from "ttag";

import { Box, Skeleton, Stack, Text } from "metabase/ui";
import type { ConcreteTableId, SearchResult } from "metabase-types/api";

import { MetricResultItem } from "./MetricResultItem";
import S from "./MetricSearchResults.module.css";

type MetricOrMeasureResult = SearchResult<number, "metric" | "measure">;

type MetricSearchResultsProps = {
  results: MetricOrMeasureResult[];
  isLoading: boolean;
  cursorIndex: number | null;
  getRef: (item: MetricOrMeasureResult) => RefObject<HTMLElement> | undefined;
  onSelectResult: (id: number, tableId?: ConcreteTableId) => void;
};

export function MetricSearchResults({
  results,
  isLoading,
  cursorIndex,
  getRef,
  onSelectResult,
}: MetricSearchResultsProps) {
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

  if (results.length === 0) {
    return (
      <Box p="xl">
        <Text c="text-secondary" ta="center">
          {t`No results found`}
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap={0} p="sm">
      <Box mah={400} className={S.listbox}>
        {results.map((item, index) => (
          <MetricResultItem
            key={`${item.model}-${item.id}`}
            ref={getRef(item)}
            name={item.name}
            slug={item.table_name ?? undefined}
            icon={item.model === "metric" ? "metric" : "sum"}
            active={cursorIndex === index}
            onClick={() =>
              onSelectResult(
                item.id,
                item.model === "measure"
                  ? (item.table_id as ConcreteTableId)
                  : undefined,
              )
            }
          />
        ))}
      </Box>
    </Stack>
  );
}
