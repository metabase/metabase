import { type ComponentType, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import { defaultClickActionMode } from "metabase/querying/click-actions/lib/modes";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Paper,
  Text,
  Title,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import type { FilterCanvasProps } from "../../types";
import S from "../expression-bar-2/ExpressionBar.module.css";

import { ExpressionBar, type ExpressionBarProps } from "./ExpressionBar";

const STAGE_INDEX = 0;

/**
 * Orders, Sum of Total, grouped by Created At: Month — the question the
 * drill-through direction starts from.
 */
export function withSumOfTotalByMonth(query: Lib.Query): Lib.Query {
  const sum = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (operator) =>
      Lib.displayInfo(query, STAGE_INDEX, operator).shortName === "sum",
  );
  const total = sum
    ? Lib.aggregationOperatorColumns(sum).find(
        (column) =>
          Lib.displayInfo(query, STAGE_INDEX, column).name === "TOTAL",
      )
    : undefined;
  const createdAt = Lib.breakoutableColumns(query, STAGE_INDEX).find(
    (column) =>
      Lib.displayInfo(query, STAGE_INDEX, column).name === "CREATED_AT",
  );
  if (!sum || !total || !createdAt) {
    return query;
  }
  const month = Lib.availableTemporalBuckets(
    query,
    STAGE_INDEX,
    createdAt,
  ).find(
    (bucket) =>
      Lib.displayInfo(query, STAGE_INDEX, bucket).shortName === "month",
  );
  const aggregated = Lib.aggregate(
    query,
    STAGE_INDEX,
    Lib.aggregationClause(sum, total),
  );
  return Lib.breakout(
    aggregated,
    STAGE_INDEX,
    month ? Lib.withTemporalBucket(createdAt, month) : createdAt,
  );
}

/**
 * A query-builder view in miniature: header, the expression bar where the
 * filter panel sits, and the chart with the real drill-through popover.
 * Drills write their filters into the same query, so they land in the bar.
 */
type QuestionViewProps = FilterCanvasProps & {
  /** The bar in the filter panel's slot; other directions swap in their own. */
  Bar?: ComponentType<ExpressionBarProps>;
};

export function QuestionView({
  query,
  onChange,
  Bar = ExpressionBar,
}: QuestionViewProps) {
  const [history, setHistory] = useState<Lib.Query[]>([]);
  const metadataProvider = useMetadataProviderUnfiltered(Lib.databaseID(query));

  const handleDrill = (nextQuery: Lib.Query) => {
    setHistory((history) => [...history, query]);
    onChange(nextQuery);
  };

  const handleBack = () => {
    const previous = history.at(-1);
    if (previous) {
      setHistory(history.slice(0, -1));
      onChange(previous);
    }
  };

  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <Group justify="space-between" px="xxl" py="lg" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          {history.length > 0 && (
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={t`Back to previous results`}
              onClick={handleBack}
            >
              <Icon name="arrow_left" />
            </ActionIcon>
          )}
          <Box>
            <Text size="sm" fw="bold" c="text-secondary">
              {t`Sample Database / Orders`}
            </Text>
            <Title order={3} fz="1.25rem">
              {Lib.suggestedName(query)}
            </Title>
          </Box>
        </Group>
      </Group>

      <Box style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}>
        <StagedBars query={query} onChange={onChange} Bar={Bar} />
      </Box>

      <Chart
        query={query}
        metadataProvider={metadataProvider}
        onDrill={handleDrill}
      />
    </Paper>
  );
}

type StagedBarsProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  Bar: ComponentType<ExpressionBarProps>;
};

/**
 * Drills on an aggregated column ("Sum of Total > 1,000") filter a new stage
 * after the summary. Each stage with filters gets its own row of the same bar,
 * numbered like the inline stages prototype.
 */
function StagedBars({ query, onChange, Bar }: StagedBarsProps) {
  const laterStages = Array.from(
    { length: Lib.stageCount(query) - 1 },
    (_, index) => index + 1,
  ).filter((stageIndex) => Lib.filters(query, stageIndex).length > 0);

  if (laterStages.length === 0) {
    return <Bar query={query} stageIndex={STAGE_INDEX} onChange={onChange} />;
  }

  return (
    <>
      {[STAGE_INDEX, ...laterStages].map((stageIndex, index) => (
        <Box key={stageIndex} pos="relative">
          <Box
            component="span"
            className={S.stageBadge}
            pos="absolute"
            left="0.75rem"
            top="1.125rem"
            style={{ zIndex: 1 }}
          >
            {index + 1}
          </Box>
          <Bar
            query={query}
            stageIndex={stageIndex}
            onChange={(next) => onChange(Lib.dropEmptyStages(next))}
          />
        </Box>
      ))}
    </>
  );
}

type ChartProps = {
  query: Lib.Query;
  metadataProvider: Lib.MetadataProvider;
  onDrill: (query: Lib.Query) => void;
};

function Chart({ query, metadataProvider, onDrill }: ChartProps) {
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const hasBreakouts =
    Lib.breakouts(query, Lib.stageCount(query) - 1).length > 0;

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!result.data?.data || result.data.data.cols.length === 0) {
      return undefined;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery,
          display: hasBreakouts ? "line" : "table",
          visualization_settings: {},
        }),
        data: result.data.data,
      },
    ];
  }, [result.data, jsQuery, hasBreakouts]);

  const errorMessage =
    result.error != null
      ? getErrorMessage(result.error)
      : result.data?.status === "failed"
        ? (result.data.error ?? t`Query failed`)
        : undefined;

  return (
    <Box
      h={480}
      p="lg"
      pos="relative"
      style={{
        opacity: result.isFetching ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      {errorMessage && (
        <Text c="feedback-negative">{String(errorMessage)}</Text>
      )}
      {rawSeries ? (
        <Visualization
          rawSeries={rawSeries}
          mode={defaultClickActionMode}
          onChangeCardAndRun={({ nextCard }) =>
            onDrill(Lib.fromJsQuery(metadataProvider, nextCard.dataset_query))
          }
        />
      ) : (
        result.isFetching && <Loader />
      )}
    </Box>
  );
}
