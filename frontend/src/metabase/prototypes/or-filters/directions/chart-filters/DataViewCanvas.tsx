import { useContext, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  NumberInput,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterCanvasProps } from "../../types";
import { ExpressionBar } from "../expression-bar-unified/ExpressionBar";

import S from "./ChartFilters.module.css";
import { QuestionChart } from "./QuestionChart";
import {
  LandedFlash,
  QuestionShell,
  useQuestionHistory,
} from "./QuestionShell";
import { LlmContext, describeFilters, getSourceName } from "./describe";
import { rowCountQuery, rowsOnly } from "./drillMenu";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;
const TABLE_NAME = "Orders";

/**
 * Two zones with different physics. "Data" on top: the source, frozen into a
 * named chip, with the full row expression behind it. "View" under the chart:
 * a sentence of what is shown, its thresholds AND-ed, next to sort and limit.
 */
export function DataViewCanvas({
  query,
  onChange,
  heading,
}: FilterCanvasProps) {
  const question = useQuestionHistory(query, onChange);
  const [hasLlm, setHasLlm] = useState(true);
  const isAggregated = Lib.aggregations(query, ROWS_STAGE).length > 0;

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
          {question.landed === "rows" && (
            <LandedFlash landedKey={question.landedKey} />
          )}
          <DataZone query={query} onChange={onChange} />
        </Box>
        <Box p="lg">
          <QuestionChart query={query} display="bar" onPick={question.apply} />
        </Box>
        {isAggregated && (
          <Box pos="relative" className={S.viewZone} px="xl" py="md">
            {question.landed === "summary" && (
              <LandedFlash landedKey={question.landedKey} />
            )}
            <ViewZone query={query} onChange={onChange} />
          </Box>
        )}
      </QuestionShell>
    </LlmContext.Provider>
  );
}

function DataZone({ query, onChange }: FilterCanvasProps) {
  const hasLlm = useContext(LlmContext);
  const hasFilters = Lib.filters(query, ROWS_STAGE).length > 0;
  const [isOpen, setIsOpen] = useState(!hasFilters);
  const name = getSourceName(query, ROWS_STAGE, TABLE_NAME, hasLlm);
  const structure = describeFilters(query, ROWS_STAGE);
  const isStructureInName = name.includes(structure);

  return (
    <Stack gap="sm">
      <Group gap="md" wrap="nowrap" align="center">
        <Text className={S.zoneLabel} w={40}>{t`Data`}</Text>
        <Button
          variant="default"
          size="compact-md"
          leftSection={<Icon name="table" />}
          rightSection={<Icon name={isOpen ? "chevronup" : "chevrondown"} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {name}
        </Button>
        <RowCount query={query} />
      </Group>
      {!isOpen && hasFilters && !isStructureInName && (
        <Text size="sm" c="text-secondary" pl={56}>
          {structure}
        </Text>
      )}
      {isOpen && (
        <Box pl={56}>
          <ExpressionBar
            query={query}
            stageIndex={ROWS_STAGE}
            onChange={onChange}
            actionsPlacement="inline"
          />
        </Box>
      )}
    </Stack>
  );
}

function RowCount({ query }: { query: Lib.Query }) {
  const rowsQuery = rowsOnly(query);
  const jsQuery = useMemo(
    () => Lib.toJsQuery(rowCountQuery(rowsQuery)),
    [rowsQuery],
  );
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const count = result.data?.data?.rows?.[0]?.[0];
  return (
    <Text size="sm" c="text-secondary">
      {typeof count === "number" ? t`${count.toLocaleString()} rows` : "…"}
    </Text>
  );
}

const OPERATOR_PHRASES: Partial<
  Record<Lib.NumberFilterOperator, () => string>
> = {
  ">=": () => t`at least`,
  ">": () => t`above`,
  "<=": () => t`at most`,
  "<": () => t`below`,
  "=": () => t`exactly`,
};

function ViewZone({ query, onChange }: FilterCanvasProps) {
  const aggregations = Lib.aggregations(query, ROWS_STAGE).map(
    (clause) => Lib.displayInfo(query, ROWS_STAGE, clause).displayName,
  );
  const breakouts = Lib.breakouts(query, ROWS_STAGE).map(
    (clause) => Lib.displayInfo(query, ROWS_STAGE, clause).displayName,
  );
  // Sort and limit may sit before the thresholds or after them, on the summary stage.
  const stageIndexes = Array.from(
    { length: Lib.stageCount(query) },
    (_, stageIndex) => stageIndex,
  );
  const orderBys = stageIndexes.flatMap((stageIndex) =>
    Lib.orderBys(query, stageIndex).map((clause) => {
      const info = Lib.displayInfo(query, stageIndex, clause);
      return info.direction === "desc"
        ? t`${info.displayName}, highest first`
        : t`${info.displayName}, lowest first`;
    }),
  );
  const limit = stageIndexes
    .map((stageIndex) => Lib.currentLimit(query, stageIndex))
    .find((stageLimit) => typeof stageLimit === "number");
  const summaryQuery =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const thresholds =
    Lib.stageCount(query) > SUMMARY_STAGE
      ? Lib.filters(query, SUMMARY_STAGE)
      : [];

  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  return (
    <Group gap="sm" align="center">
      <Text className={S.zoneLabel} w={40}>{t`View`}</Text>
      <Text fw="bold">
        {t`${aggregations.join(t` and `)} by ${breakouts.join(t` and `)}`}
      </Text>
      {thresholds.length > 0 && (
        <Text c="text-secondary">{t`· only where`}</Text>
      )}
      {thresholds.map((filter, index) => (
        <Group key={index} gap="sm" wrap="nowrap">
          {index > 0 && <Text c="text-secondary">{t`and`}</Text>}
          <Threshold query={query} filter={filter} onChange={handleChange} />
        </Group>
      ))}
      <AddThreshold summaryQuery={summaryQuery} onChange={handleChange} />
      {orderBys.length > 0 && (
        <Text c="text-secondary">{t`· sorted by ${orderBys.join(", ")}`}</Text>
      )}
      {typeof limit === "number" && (
        <Text c="text-secondary">{t`· top ${limit}`}</Text>
      )}
    </Group>
  );
}

type ThresholdProps = {
  query: Lib.Query;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

/** A summary filter as a phrase with its number editable in place. */
function Threshold({ query, filter, onChange }: ThresholdProps) {
  const parts = Lib.numberFilterParts(query, SUMMARY_STAGE, filter);
  const phrase = parts ? OPERATOR_PHRASES[parts.operator]?.() : undefined;
  const value = parts?.values[0];
  const remove = () => onChange(Lib.removeClause(query, SUMMARY_STAGE, filter));

  return (
    <Box className={S.threshold}>
      {parts && phrase && typeof value === "number" ? (
        <>
          <Text size="sm">
            {Lib.displayInfo(query, SUMMARY_STAGE, parts.column).displayName}{" "}
            {phrase}
          </Text>
          <NumberInput
            size="xs"
            w={100}
            value={value}
            thousandSeparator=","
            hideControls
            onChange={(nextValue) => {
              if (typeof nextValue === "number") {
                onChange(
                  Lib.replaceClause(
                    query,
                    SUMMARY_STAGE,
                    filter,
                    Lib.numberFilterClause({ ...parts, values: [nextValue] }),
                  ),
                );
              }
            }}
          />
        </>
      ) : (
        <Text size="sm">
          {Lib.displayInfo(query, SUMMARY_STAGE, filter).displayName}
        </Text>
      )}
      <ActionIcon
        size="sm"
        variant="subtle"
        aria-label={t`Remove`}
        onClick={remove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}

type AddThresholdProps = {
  summaryQuery: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

/** Only measures are offered: a filter on a breakout belongs to the rows. */
function AddThreshold({ summaryQuery, onChange }: AddThresholdProps) {
  const aggregationNames = new Set(
    Lib.returnedColumns(summaryQuery, ROWS_STAGE)
      .map((column) => Lib.displayInfo(summaryQuery, ROWS_STAGE, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  const measures = Lib.filterableColumns(summaryQuery, SUMMARY_STAGE).filter(
    (column) =>
      aggregationNames.has(
        Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).name,
      ),
  );

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<Icon name="add" />}
        >
          {t`Only show where…`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {measures.map((column, index) => (
          <Menu.Item
            key={index}
            onClick={() =>
              onChange(
                Lib.filter(
                  summaryQuery,
                  SUMMARY_STAGE,
                  Lib.numberFilterClause({
                    operator: ">=",
                    column,
                    values: [0],
                  }),
                ),
              )
            }
          >
            {t`${Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).displayName} is at least…`}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
