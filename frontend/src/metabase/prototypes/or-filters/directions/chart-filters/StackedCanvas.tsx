import { useContext, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { Box, Group, Stack, Switch, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterCanvasProps } from "../../types";
import { ExpressionBar } from "../expression-bar-unified/ExpressionBar";
import { SummaryPills } from "../expression-bar-unified/SummaryPills";

import S from "./ChartFilters.module.css";
import { QuestionChart } from "./QuestionChart";
import {
  LandedFlash,
  QuestionShell,
  useQuestionHistory,
} from "./QuestionShell";
import {
  LlmContext,
  describeFilter,
  describeFilters,
  llmSourceName,
} from "./describe";
import { rowCountQuery, rowsOnly } from "./drillMenu";

const ROWS_STAGE = 0;
const TABLE_NAME = "Orders";

/**
 * No stages to understand: every filter, wherever it comes from, is one row
 * expression on Orders; the summary only keeps its thresholds, an AND-ed tail
 * "after summarizing". Each top-level condition shows the rows left after it.
 */
export function StackedCanvas({ query, onChange, heading }: FilterCanvasProps) {
  const question = useQuestionHistory(query, onChange);
  const [hasLlm, setHasLlm] = useState(true);

  return (
    <LlmContext.Provider value={hasLlm}>
      <QuestionShell
        query={query}
        heading={heading}
        canGoBack={question.canGoBack}
        onBack={question.back}
        settings={
          <Switch
            label={t`Metabot available`}
            checked={hasLlm}
            onChange={(event) => setHasLlm(event.currentTarget.checked)}
          />
        }
      >
        <Box pos="relative" className={S.dataZone} px="xl" py="md">
          <LandedFlash landedKey={question.landedKey} />
          <Stack gap="sm">
            <ExpressionBar
              query={query}
              stageIndex={ROWS_STAGE}
              onChange={onChange}
              trailing={
                <SummaryPills
                  query={query}
                  stageIndex={ROWS_STAGE}
                  onChange={onChange}
                  label={t`after summarizing`}
                />
              }
              actionsPlacement="below"
            />
            <FilterSummary query={query} />
            <RowFunnel query={query} />
          </Stack>
        </Box>
        <Box p="lg">
          <QuestionChart
            query={query}
            display="bar"
            onPick={question.apply}
            onLegacyDrill={(nextQuery) => question.apply(nextQuery)}
          />
        </Box>
      </QuestionShell>
    </LlmContext.Provider>
  );
}

/** The whole filter in a line: Metabot's name, or the structural reading. */
function FilterSummary({ query }: { query: Lib.Query }) {
  const hasLlm = useContext(LlmContext);
  const rows =
    (hasLlm ? llmSourceName(query, ROWS_STAGE) : undefined) ??
    describeFilters(query, ROWS_STAGE);
  const thresholds = Array.from(
    { length: Lib.stageCount(query) - 1 },
    (_, index) => describeFilters(query, index + 1),
  )
    .filter((description) => description !== "")
    .join(" · ");

  if (rows === "" && thresholds === "") {
    return null;
  }
  return (
    <Text size="sm" c="text-secondary">
      <Text span size="sm" fw="bold" c="text-secondary">
        {t`Summary:`}
      </Text>{" "}
      {rows || TABLE_NAME}
      {thresholds && t` · after summarizing: ${thresholds}`}
    </Text>
  );
}

type FunnelStep = { label: string; query: Lib.Query };

/** Orders, then the count after conditions 1..n, then the bars left by the thresholds. */
function RowFunnel({ query }: { query: Lib.Query }) {
  const steps = useMemo(() => getFunnelSteps(query), [query]);
  const bars = useMemo(() => barCountQuery(query), [query]);
  const baseCount = useCount(steps[0].query);

  if (steps.length === 1 && !bars) {
    return null;
  }
  return (
    <Stack gap={2}>
      {steps.map((step, index) => (
        <FunnelRow
          key={index}
          index={index}
          label={step.label}
          countQuery={step.query}
          baseCount={baseCount}
        />
      ))}
      {bars && <BarCount query={bars} />}
    </Stack>
  );
}

function getFunnelSteps(query: Lib.Query): FunnelStep[] {
  const rows = rowsOnly(query);
  const filters = Lib.filters(rows, ROWS_STAGE);
  const upTo = (count: number) =>
    rowCountQuery(
      filters
        .slice(count)
        .reduce(
          (next, filter) => Lib.removeClause(next, ROWS_STAGE, filter),
          rows,
        ),
    );
  return [
    { label: TABLE_NAME, query: upTo(0) },
    ...filters.map((filter, index) => ({
      label: describeFilter(rows, ROWS_STAGE, filter),
      query: upTo(index + 1),
    })),
  ];
}

/** Counts the result rows, i.e. the bars, once the summary has thresholds. */
function barCountQuery(query: Lib.Query): Lib.Query | undefined {
  const hasThresholds = Array.from(
    { length: Lib.stageCount(query) - 1 },
    (_, index) => Lib.filters(query, index + 1).length > 0,
  ).some(Boolean);
  if (!hasThresholds) {
    return undefined;
  }
  const counted = Lib.appendStage(query);
  return Lib.aggregateByCount(counted, Lib.stageCount(counted) - 1);
}

function useCount(query: Lib.Query): number | undefined {
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const count = result.data?.data?.rows?.[0]?.[0];
  return typeof count === "number" ? count : undefined;
}

type FunnelRowProps = {
  index: number;
  label: string;
  countQuery: Lib.Query;
  baseCount: number | undefined;
};

function FunnelRow({ index, label, countQuery, baseCount }: FunnelRowProps) {
  const count = useCount(countQuery);
  const share =
    count != null && baseCount ? Math.max(count / baseCount, 0.005) : 0;

  return (
    <Group gap="sm" wrap="nowrap" className={S.funnelRow}>
      <Text size="sm" c="text-secondary" w={20} ta="right">
        {index > 0 ? index : ""}
      </Text>
      <Text size="sm" truncate="end" className={S.funnelLabel} title={label}>
        {index > 0 ? t`and ${label}` : label}
      </Text>
      <Box className={S.funnelTrack}>
        <Box className={S.funnelFill} style={{ width: `${share * 100}%` }} />
      </Box>
      <Text size="sm" fw="bold" w={80} ta="right">
        {count != null ? count.toLocaleString() : "…"}
      </Text>
    </Group>
  );
}

function BarCount({ query }: { query: Lib.Query }) {
  const count = useCount(query);
  return (
    <Group gap="sm" wrap="nowrap" className={S.funnelRow}>
      <Box w={20} />
      <Text size="sm" c="text-secondary" className={S.funnelLabel}>
        {t`after summarizing, only the bars that pass the thresholds`}
      </Text>
      <Text size="sm" fw="bold" w={80} ta="right">
        {count != null ? t`${count.toLocaleString()} bars` : "…"}
      </Text>
    </Group>
  );
}
