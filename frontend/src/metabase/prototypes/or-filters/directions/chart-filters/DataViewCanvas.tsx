import cx from "classnames";
import {
  type ComponentType,
  type RefObject,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  NumberInput,
  Popover,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import type { FilterCanvasProps } from "../../types";
import BarS from "../expression-bar-rows/ExpressionBar.module.css";
import { ExpressionBar } from "../expression-bar-unified/ExpressionBar";

import S from "./ChartFilters.module.css";
import {
  type AxisTitleFrame,
  type LegendFrame,
  QuestionChart,
} from "./QuestionChart";
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
  DataZone = SourceDataZone,
  Legend,
  LegendWrap,
  AxisTitle,
}: FilterCanvasProps & {
  DataZone?: ComponentType<FilterCanvasProps>;
  /** Replaces the chart's legend and the thresholds beside it. */
  Legend?: ComponentType<FilterCanvasProps & { isFilteredOnly?: boolean }>;
  /** Wraps the chart's own legend when it shows series rather than measures. */
  LegendWrap?: ComponentType<FilterCanvasProps & { frame: LegendFrame }>;
  /** Replaces the y-axis title while one measure is plotted. */
  AxisTitle?: ComponentType<FilterCanvasProps & { frame: AxisTitleFrame }>;
}) {
  const question = useQuestionHistory(query, onChange);
  const [hasLlm, setHasLlm] = useState(true);
  const isAggregated = Lib.aggregations(query, ROWS_STAGE).length > 0;
  // A second breakout splits the chart into series: the legend shows those, and
  // the measures lead it.
  const hasSeries = Lib.breakouts(query, ROWS_STAGE).length > 1;
  // Like the app, one measure without series has no legend: its axis title
  // takes over.
  const hasAxisTitle =
    AxisTitle != null &&
    !hasSeries &&
    Lib.aggregations(query, ROWS_STAGE).length === 1;
  const [isAxisTitleShown, setIsAxisTitleShown] = useState(true);
  // With axis titles turned off, the legend comes back, but only to show a
  // condition: an unfiltered measure stays without one, as in the app.
  const isLegendFallback = hasAxisTitle && !isAxisTitleShown;
  const isLegendReplaced =
    Legend != null && !hasSeries && (!hasAxisTitle || isLegendFallback);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInset = useFirstFilterInset(
    chartRef,
    Legend != null || LegendWrap != null,
  );
  // A swapped-in Data zone is a plain bar, with the thresholds right under it.
  const isCompact = DataZone !== SourceDataZone;

  return (
    <LlmContext.Provider value={hasLlm}>
      <QuestionShell
        query={query}
        heading={heading}
        canGoBack={question.canGoBack}
        onBack={question.back}
        settings={
          !isCompact && (
            <Switch
              label={t`Metabot available`}
              checked={hasLlm}
              onChange={(event) => setHasLlm(event.currentTarget.checked)}
            />
          )
        }
      >
        {isCompact ? (
          <>
            <DataZone query={query} onChange={onChange} />
          </>
        ) : (
          <Box pos="relative" className={S.dataZone} px="xl" py="md">
            {question.landed === "rows" && (
              <LandedFlash landedKey={question.landedKey} />
            )}
            <DataZone query={query} onChange={onChange} />
          </Box>
        )}
        <Box
          ref={chartRef}
          p="lg"
          pl={chartInset}
          className={cx(isLegendReplaced && S.hidesNativeLegend)}
        >
          {isLegendReplaced && isAggregated && (
            <Box pos="relative">
              {question.landed === "summary" && (
                <LandedFlash landedKey={question.landedKey} />
              )}
              <Legend
                query={query}
                onChange={onChange}
                isFilteredOnly={isLegendFallback}
              />
            </Box>
          )}
          <QuestionChart
            query={query}
            display="bar"
            onPick={question.apply}
            onLegacyDrill={(nextQuery) => question.apply(nextQuery)}
            onYAxisTitleChange={setIsAxisTitleShown}
            yAxisTitle={
              AxisTitle && hasAxisTitle
                ? (frame) => (
                    <AxisTitle
                      query={query}
                      onChange={onChange}
                      frame={frame}
                    />
                  )
                : undefined
            }
            legendWrap={
              LegendWrap && hasSeries && isAggregated
                ? (frame) => (
                    <LegendWrap
                      query={query}
                      onChange={onChange}
                      frame={frame}
                    />
                  )
                : undefined
            }
            legendAccessory={
              isCompact &&
              isAggregated &&
              !Legend && (
                <Box pos="relative">
                  {question.landed === "summary" && (
                    <LandedFlash landedKey={question.landedKey} />
                  )}
                  <ThresholdPills query={query} onChange={onChange} />
                </Box>
              )
            }
          />
        </Box>
        {isAggregated && !isCompact && (
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

const BAR_INSET = 32;

/**
 * How far in from the chart's edge the filter bar's first pill starts, so the
 * legend can line up with it. Falls back to the bar's own padding.
 */
function useFirstFilterInset(
  chartRef: RefObject<HTMLDivElement>,
  isEnabled: boolean,
): number | undefined {
  const [inset, setInset] = useState<number>();

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const root = chart?.parentElement;
    if (!chart || !root || !isEnabled) {
      return;
    }
    const update = () => {
      const bar = root.querySelector(`.${BarS.bar}`);
      const pill = bar?.querySelector(`.${BarS.pill}`);
      const chartLeft = chart.getBoundingClientRect().left;
      const nextInset = pill
        ? Math.round(pill.getBoundingClientRect().left - chartLeft)
        : bar
          ? Math.round(bar.getBoundingClientRect().left - chartLeft) + BAR_INSET
          : undefined;
      setInset(nextInset);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [chartRef, isEnabled]);

  return inset;
}

function SourceDataZone({ query, onChange }: FilterCanvasProps) {
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

export function RowCount({ query }: { query: Lib.Query }) {
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

/** Just the thresholds as pills and a "+" to add one: no sentence, no sort. */
function ThresholdPills({ query, onChange }: FilterCanvasProps) {
  const summaryQuery =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const thresholds =
    Lib.stageCount(query) > SUMMARY_STAGE
      ? Lib.filters(query, SUMMARY_STAGE)
      : [];
  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  return (
    <Group gap={6} align="center" wrap="nowrap">
      {thresholds.map((filter, index) => (
        <CompactThreshold
          key={index}
          query={query}
          filter={filter}
          onChange={handleChange}
        />
      ))}
      <AddCompactThreshold
        summaryQuery={summaryQuery}
        isEmpty={thresholds.length === 0}
        onChange={handleChange}
      />
    </Group>
  );
}

type CompactThresholdProps = {
  query: Lib.Query;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

/** A small pill; clicking it opens the app's own number filter with Apply. */
function CompactThreshold({ query, filter, onChange }: CompactThresholdProps) {
  const [isOpened, setIsOpened] = useState(false);
  const column = Lib.numberFilterParts(query, SUMMARY_STAGE, filter)?.column;
  const remove = () => onChange(Lib.removeClause(query, SUMMARY_STAGE, filter));

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <UnstyledButton
          className={cx(S.threshold, S.thresholdCompact)}
          onClick={() => setIsOpened(!isOpened)}
        >
          <Text size="xs" fw="bold" c="inherit">
            {Lib.displayInfo(query, SUMMARY_STAGE, filter).displayName}
          </Text>
          <Icon
            name="close"
            size={10}
            className={S.thresholdRemove}
            aria-label={t`Remove`}
            onClick={(event) => {
              event.stopPropagation();
              remove();
            }}
          />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        {column && (
          <FilterPickerBody
            query={query}
            stageIndex={SUMMARY_STAGE}
            column={column}
            filter={filter}
            onChange={(clause) => {
              onChange(
                Lib.replaceClause(
                  query,
                  SUMMARY_STAGE,
                  filter,
                  toFilterClause(query, SUMMARY_STAGE, clause),
                ),
              );
              setIsOpened(false);
            }}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

type AddCompactThresholdProps = {
  summaryQuery: Lib.Query;
  isEmpty: boolean;
  onChange: (query: Lib.Query) => void;
};

/** "+": pick a measure, then set its number in the app's filter picker. */
function AddCompactThreshold({
  summaryQuery,
  isEmpty,
  onChange,
}: AddCompactThresholdProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [column, setColumn] = useState<Lib.ColumnMetadata>();
  const measures = getMeasures(summaryQuery);
  const close = () => {
    setIsOpened(false);
    setColumn(undefined);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      onChange={(opened) => (opened ? setIsOpened(true) : close())}
    >
      <Popover.Target>
        {isEmpty ? (
          <UnstyledButton
            className={cx(S.threshold, S.thresholdCompact, S.thresholdEmpty)}
            onClick={() => (isOpened ? close() : setIsOpened(true))}
          >
            <Text size="xs" fw="bold" c="inherit">{t`Show if…`}</Text>
          </UnstyledButton>
        ) : (
          <ActionIcon
            size="sm"
            variant="subtle"
            c="text-secondary"
            aria-label={t`Add a filter on the summary`}
            onClick={() => (isOpened ? close() : setIsOpened(true))}
          >
            <Icon name="add" size={12} />
          </ActionIcon>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        {column ? (
          <FilterPickerBody
            query={summaryQuery}
            stageIndex={SUMMARY_STAGE}
            column={column}
            isNew
            onBack={() => setColumn(undefined)}
            onChange={(clause) => {
              onChange(
                Lib.filter(
                  summaryQuery,
                  SUMMARY_STAGE,
                  toFilterClause(summaryQuery, SUMMARY_STAGE, clause),
                ),
              );
              close();
            }}
          />
        ) : (
          <Stack gap={0} p="sm" miw={200}>
            {!isEmpty && (
              <Text size="xs" fw="bold" c="text-secondary" px="sm" pb="xs">
                {t`Show if…`}
              </Text>
            )}
            {measures.map((measure, index) => (
              <Button
                key={index}
                variant="subtle"
                justify="flex-start"
                onClick={() => setColumn(measure)}
              >
                {
                  Lib.displayInfo(summaryQuery, SUMMARY_STAGE, measure)
                    .displayName
                }
              </Button>
            ))}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

type ThresholdProps = {
  query: Lib.Query;
  isCompact?: boolean;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

/** A summary filter as a phrase with its number editable in place. */
function Threshold({ query, filter, isCompact, onChange }: ThresholdProps) {
  const parts = Lib.numberFilterParts(query, SUMMARY_STAGE, filter);
  const phrase = parts ? OPERATOR_PHRASES[parts.operator]?.() : undefined;
  const value = parts?.values[0];
  const remove = () => onChange(Lib.removeClause(query, SUMMARY_STAGE, filter));

  return (
    <Box className={cx(S.threshold, { [S.thresholdCompact]: isCompact })}>
      {parts && phrase && typeof value === "number" ? (
        <>
          <Text size={isCompact ? "xs" : "sm"}>
            {Lib.displayInfo(query, SUMMARY_STAGE, parts.column).displayName}{" "}
            {phrase}
          </Text>
          <NumberInput
            size="xs"
            w={isCompact ? 56 : 100}
            variant={isCompact ? "unstyled" : undefined}
            classNames={isCompact ? { input: S.compactInput } : undefined}
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
        <Text size={isCompact ? "xs" : "sm"}>
          {Lib.displayInfo(query, SUMMARY_STAGE, filter).displayName}
        </Text>
      )}
      <ActionIcon
        size={isCompact ? "xs" : "sm"}
        variant="subtle"
        aria-label={t`Remove`}
        onClick={remove}
      >
        <Icon name="close" size={isCompact ? 10 : 12} />
      </ActionIcon>
    </Box>
  );
}

type AddThresholdProps = {
  summaryQuery: Lib.Query;
  isCompact?: boolean;
  onChange: (query: Lib.Query) => void;
};

/** Only measures are offered: a filter on a breakout belongs to the rows. */
function AddThreshold({
  summaryQuery,
  isCompact,
  onChange,
}: AddThresholdProps) {
  const measures = getMeasures(summaryQuery);

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        {isCompact ? (
          <ActionIcon
            size="sm"
            variant="subtle"
            c="text-secondary"
            aria-label={t`Add a filter on the summary`}
          >
            <Icon name="add" size={12} />
          </ActionIcon>
        ) : (
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
          >
            {t`Only show where…`}
          </Button>
        )}
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

function getMeasures(summaryQuery: Lib.Query): Lib.ColumnMetadata[] {
  const aggregationNames = new Set(
    Lib.returnedColumns(summaryQuery, ROWS_STAGE)
      .map((column) => Lib.displayInfo(summaryQuery, ROWS_STAGE, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  return Lib.filterableColumns(summaryQuery, SUMMARY_STAGE).filter((column) =>
    aggregationNames.has(
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).name,
    ),
  );
}
