import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import { Box, Group, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import {
  type CardDisplayType,
  type RawSeries,
  isCardDisplayType,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { ALL_DRILLS_CLICK_MODE } from "./drillMode";

type QueryResultsProps = {
  query: Lib.Query;
  stageIndex: number;
  display: CardDisplayType;
  /** A drill in the results produced a new query (and possibly a new display). */
  onChange: (query: Lib.Query, display: CardDisplayType) => void;
};

export function QueryResults({
  query,
  stageIndex,
  display,
  onChange,
}: QueryResultsProps) {
  const metadataProvider = useMetadataProviderUnfiltered(Lib.databaseID(query));
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const countJsQuery = useMemo(
    () => Lib.toJsQuery(countQuery(query, stageIndex)),
    [query, stageIndex],
  );

  const rows = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const count = useGetAdhocQueryQuery({ ...countJsQuery, ignore_error: true });

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!rows.data?.data || rows.data.data.cols.length === 0) {
      return undefined;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery,
          display,
          visualization_settings: {},
        }),
        data: rows.data.data,
      },
    ];
  }, [rows.data, jsQuery, display]);

  const rowCount = count.data?.data?.rows?.[0]?.[0];
  const errorMessage =
    rows.error != null
      ? getErrorMessage(rows.error)
      : rows.data?.status === "failed"
        ? (rows.data.error ?? "Query failed")
        : undefined;

  return (
    <Box>
      <Group gap="sm" mb="sm" mih={24}>
        <Text fw="bold">{t`Results`}</Text>
        {count.isFetching ? (
          <Loader size="xs" />
        ) : (
          rowCount != null && (
            <Text c="text-secondary">{t`${String(rowCount)} rows match`}</Text>
          )
        )}
      </Group>
      {errorMessage && (
        <Text c="feedback-negative">{String(errorMessage)}</Text>
      )}
      <Box
        h={440}
        pos="relative"
        style={{
          opacity: rows.isFetching ? 0.5 : 1,
          transition: "opacity 150ms",
        }}
      >
        {rawSeries ? (
          <Visualization
            queryBuilderMode="dataset"
            rawSeries={rawSeries}
            mode={ALL_DRILLS_CLICK_MODE}
            onChangeCardAndRun={({ nextCard }) =>
              onChange(
                Lib.fromJsQuery(metadataProvider, nextCard.dataset_query),
                isCardDisplayType(nextCard.display)
                  ? nextCard.display
                  : display,
              )
            }
          />
        ) : (
          rows.isFetching && <Loader />
        )}
      </Box>
    </Box>
  );
}

/** Counts the rows the query returns; an aggregated query is counted on a stage of its own. */
function countQuery(query: Lib.Query, stageIndex: number): Lib.Query {
  const isAggregated = Lib.aggregations(query, stageIndex).length > 0;
  return isAggregated
    ? Lib.aggregateByCount(Lib.appendStage(query), -1)
    : Lib.aggregateByCount(query, stageIndex);
}
