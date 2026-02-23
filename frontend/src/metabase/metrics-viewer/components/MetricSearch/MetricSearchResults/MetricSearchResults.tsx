import type { RefObject } from "react";
import { t } from "ttag";

import { Box, Repeat, Skeleton, Stack, Text } from "metabase/ui";

import type { MetricOrMeasureResult } from "../../../hooks/use-metric-measure-search";
import { MetricResultItem } from "../MetricResultItem";

import S from "./MetricSearchResults.module.css";

type MetricSearchResultsProps = {
  results: MetricOrMeasureResult[];
  isLoading: boolean;
  cursorIndex: number | null;
  getRef: (item: MetricOrMeasureResult) => RefObject<HTMLElement> | undefined;
  onSelectResult: (id: number, model: "metric" | "measure") => void;
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
      <Stack gap="sm" p="sm">
        <Repeat times={3}>
          <Skeleton h={24} natural radius={4} />
        </Repeat>
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
    <Box mah={400} p="sm" className={S.listbox}>
      {results.map((item, index) => (
        <MetricResultItem
          key={`${item.model}-${item.id}`}
          ref={getRef(item)}
          name={item.name}
          slug={item.table_name ?? undefined}
          icon={item.model === "metric" ? "metric" : "sum"}
          active={cursorIndex === index}
          onClick={() => onSelectResult(item.id, item.model)}
        />
      ))}
    </Box>
  );
}
