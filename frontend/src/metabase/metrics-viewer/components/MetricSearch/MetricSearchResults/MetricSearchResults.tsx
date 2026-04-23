import type React from "react";
import { t } from "ttag";

import { useGetIcon } from "metabase/hooks/use-icon";
import { Box, Repeat, Skeleton, Stack, Text } from "metabase/ui";

import type { MetricOrMeasureResult } from "../../../hooks/use-metric-measure-search";
import { MetricResultItem } from "../MetricResultItem";

import S from "./MetricSearchResults.module.css";

type MetricSearchResultsProps = {
  results: MetricOrMeasureResult[];
  isLoading: boolean;
  cursorIndex: number | null;
  getRef: (
    item: MetricOrMeasureResult,
  ) => React.RefObject<HTMLDivElement> | undefined;
  onSelectResult: (id: number, model: "metric" | "measure") => void;
};

export function MetricSearchResults({
  results,
  isLoading,
  cursorIndex,
  getRef,
  onSelectResult,
}: MetricSearchResultsProps) {
  const getIcon = useGetIcon();
  if (isLoading) {
    return (
      <Stack gap="sm" p="sm">
        <Repeat times={3}>
          <Skeleton h="lg" natural radius="xs" />
        </Repeat>
      </Stack>
    );
  }

  if (results.length === 0) {
    return (
      <Box p="xl" data-testid="metrics-search-results">
        <Text c="text-secondary" ta="center">
          {t`No results found`}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      mah="25rem"
      p="sm"
      className={S.listbox}
      data-testid="metrics-search-results"
    >
      {results.map((item, index) => (
        <MetricResultItem
          key={`${item.model}-${item.id}`}
          ref={getRef(item)}
          name={item.name}
          slug={item.table_name ?? undefined}
          icon={getIcon(item).name}
          active={cursorIndex === index}
          onClick={() => onSelectResult(item.id, item.model)}
        />
      ))}
    </Box>
  );
}
