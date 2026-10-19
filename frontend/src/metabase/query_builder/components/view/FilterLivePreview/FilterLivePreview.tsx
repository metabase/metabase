import { useDebouncedValue } from "@mantine/hooks";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  LIVE_FILTER_PREVIEW,
  LIVE_FILTER_PREVIEW_DELAY_MS,
  LIVE_FILTER_PREVIEW_SLOW_DATA,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  FilterPreviewContext,
  type FilterPreviewContextValue,
  type FilterPreviewProps,
} from "metabase/querying/filters/components/FilterPicker/FilterPreviewContext";
import { useSetting } from "metabase/settings";
import { Box, Center, Flex, Loader, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { PrototypeDataInfo, RawSeries } from "metabase-types/api";

const PREVIEW_WIDTH = 440;
const CHART_HEIGHT = 280;

interface FilterLivePreviewProviderProps {
  question: Question;
  children: ReactNode;
}

/**
 * Prototype: filter pickers inside this provider show a small live preview of
 * the question, with the filter they edit applied.
 */
export function FilterLivePreviewProvider({
  question,
  children,
}: FilterLivePreviewProviderProps) {
  const value = useMemo<FilterPreviewContextValue>(
    () => ({
      renderPreview: (props) => (
        <FilterLivePreview question={question} {...props} />
      ),
    }),
    [question],
  );

  return (
    <FilterPreviewContext.Provider value={value}>
      {children}
    </FilterPreviewContext.Provider>
  );
}

interface FilterLivePreviewProps extends FilterPreviewProps {
  question: Question;
}

function FilterLivePreview({
  question,
  query,
  stageIndex,
  filter,
  draftFilter,
}: FilterLivePreviewProps) {
  const [isEnabled] = usePrototypeSetting(LIVE_FILTER_PREVIEW);
  const [delayMs] = usePrototypeSetting(LIVE_FILTER_PREVIEW_DELAY_MS);
  const [isEnabledForSlowData] = usePrototypeSetting(
    LIVE_FILTER_PREVIEW_SLOW_DATA,
  );
  const prototypeData = useSetting("prototype-data");

  const previewQuery = useMemo(
    () => getPreviewQuery(query, stageIndex, filter, draftFilter),
    [query, stageIndex, filter, draftFilter],
  );
  const isSlow = useMemo(
    () => readsSlowTable(previewQuery, prototypeData),
    [previewQuery, prototypeData],
  );
  const isVisible = isEnabled && (!isSlow || isEnabledForSlowData);

  const [debouncedQuery] = useDebouncedValue(previewQuery, delayMs);
  const isDebouncing = debouncedQuery !== previewQuery;
  const jsQuery = useMemo(
    () => Lib.toJsQuery(debouncedQuery),
    [debouncedQuery],
  );

  const { data, error, isFetching } = useGetAdhocQueryQuery(
    isVisible ? { ...jsQuery, ignore_error: true } : skipToken,
  );

  const rawSeries = useMemo((): RawSeries | undefined => {
    if (!data?.data || data.status === "failed") {
      return undefined;
    }
    const card = question.setQuery(debouncedQuery).card();
    return [{ card, data: data.data }];
  }, [data, question, debouncedQuery]);

  if (!isVisible) {
    return null;
  }

  const errorMessage = error
    ? getErrorMessage(error)
    : data?.status === "failed"
      ? t`The preview query failed`
      : undefined;
  const isUpdating = isFetching || isDebouncing;

  return (
    <Stack
      w={PREVIEW_WIDTH}
      p="md"
      gap="sm"
      bg="background_page-secondary"
      style={{ borderLeft: "1px solid var(--mb-color-border-neutral)" }}
      data-testid="filter-live-preview"
    >
      <Flex justify="space-between" align="center">
        <Text fw="bold" size="sm" c="text-secondary">
          {draftFilter ? t`Preview` : t`Current result`}
        </Text>
        {isUpdating && <Loader size="xs" />}
      </Flex>
      <Box
        h={CHART_HEIGHT}
        pos="relative"
        bg="background_page-primary"
        style={{
          borderRadius: "var(--mantine-radius-md)",
          opacity: isUpdating && rawSeries ? 0.6 : 1,
          transition: "opacity 150ms",
        }}
      >
        {errorMessage ? (
          <Center h="100%" p="md">
            <Text c="text-secondary" ta="center">
              {errorMessage}
            </Text>
          </Center>
        ) : rawSeries ? (
          <Visualization rawSeries={rawSeries} isDashboard showTitle={false} />
        ) : (
          <Center h="100%">
            <Loader />
          </Center>
        )}
      </Box>
      {rawSeries && (
        <Text size="xs" c="text-secondary">
          {getRowCountLabel(rawSeries)}
        </Text>
      )}
    </Stack>
  );
}

function getPreviewQuery(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.Filterable | undefined,
  draftFilter: Lib.ExpressionClause | undefined,
): Lib.Query {
  if (draftFilter == null) {
    return Lib.dropEmptyStages(query);
  }
  const queryWithFilter =
    filter != null && !Lib.isSegmentMetadata(filter)
      ? Lib.replaceClause(query, stageIndex, filter, draftFilter)
      : Lib.filter(query, stageIndex, draftFilter);
  return Lib.dropEmptyStages(queryWithFilter);
}

function readsSlowTable(
  query: Lib.Query,
  prototypeData: PrototypeDataInfo | null | undefined,
): boolean {
  if (prototypeData == null) {
    return false;
  }
  const slowTableIds = new Set<unknown>(prototypeData.slow_table_ids);
  return Lib.dependentMetadata(query, undefined, "question").some(
    (item) => item.type === "table" && slowTableIds.has(item.id),
  );
}

function getRowCountLabel(rawSeries: RawSeries): string {
  const rowCount = rawSeries[0]?.data.rows.length ?? 0;
  return rowCount === 1 ? t`1 row` : t`${rowCount} rows`;
}
