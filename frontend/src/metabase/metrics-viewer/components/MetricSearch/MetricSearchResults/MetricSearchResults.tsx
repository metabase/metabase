import type React from "react";
import { t } from "ttag";

import { Box, Divider, Repeat, Skeleton, Stack, Text } from "metabase/ui";

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
  onSummarizeTable?: () => void;
};

export function MetricSearchResults({
  results,
  isLoading,
  cursorIndex,
  getRef,
  onSelectResult,
  onSummarizeTable,
}: MetricSearchResultsProps) {
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
      <Box data-testid="metrics-search-results">
        <Box p="xl">
          <Text c="text-secondary" ta="center">
            {t`No results found`}
          </Text>
        </Box>
        {onSummarizeTable && (
          <>
            <Divider />
            <Box p="sm">
              <MetricResultItem
                name={t`Summarize a table`}
                icon="table"
                onClick={onSummarizeTable}
              />
            </Box>
          </>
        )}
      </Box>
    );
  }

  return (
    <Box data-testid="metrics-search-results">
      <Box mah="25rem" p="sm" className={S.listbox}>
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
      {onSummarizeTable && (
        <>
          <Divider />
          <Box p="sm">
            <MetricResultItem
              name={t`Summarize a table`}
              icon="table"
              onClick={onSummarizeTable}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
