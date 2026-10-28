import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Box, Group, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

type QueryResultsProps = {
  query: Lib.Query;
  stageIndex: number;
};

export function QueryResults({ query, stageIndex }: QueryResultsProps) {
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const countJsQuery = useMemo(
    () => Lib.toJsQuery(Lib.aggregateByCount(query, stageIndex)),
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
          display: "table",
          visualization_settings: {},
        }),
        data: rows.data.data,
      },
    ];
  }, [rows.data, jsQuery]);

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
          <Visualization queryBuilderMode="dataset" rawSeries={rawSeries} />
        ) : (
          rows.isFetching && <Loader />
        )}
      </Box>
    </Box>
  );
}
