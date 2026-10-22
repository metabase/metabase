import { useDebouncedValue } from "@mantine/hooks";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  LIVE_FILTER_PREVIEW_ANIMATION,
  LIVE_FILTER_PREVIEW_ANIMATION_MS,
  LIVE_FILTER_PREVIEW_DELAY_MS,
  LIVE_FILTER_PREVIEW_MODE,
  LIVE_FILTER_PREVIEW_ONION_SKIN,
  LIVE_FILTER_PREVIEW_SLOW_DATA,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  FilterPreviewContext,
  type FilterPreviewContextValue,
  type FilterPreviewProps,
} from "metabase/querying/filters/components/FilterPicker/FilterPreviewContext";
import { useSetting } from "metabase/settings";
import { Box, Center, Flex, Icon, Loader, Stack, Text } from "metabase/ui";
import { colors, staticVizOverrides } from "metabase/ui/colors";
import { getColorsForValues } from "metabase/ui/colors/charts";
import {
  type ChartAnimation,
  ChartAnimationContext,
} from "metabase/visualizations/components/EChartsRenderer/ChartAnimationContext";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  Dataset,
  DatasetColumn,
  DatasetData,
  PrototypeDataInfo,
  RawSeries,
  RowValue,
} from "metabase-types/api";

const POPOVER_PREVIEW_WIDTH = 440;
const POPOVER_CHART_HEIGHT = 280;

interface MainChartPreview {
  question: Question;
  result: Dataset | null;
  previewQuery: Lib.Query | null;
}

const MainChartPreviewContext = createContext<MainChartPreview | null>(null);

interface FilterLivePreviewProviderProps {
  question: Question;
  result: Dataset | null;
  children: ReactNode;
}

/**
 * Prototype: filter pickers inside this provider show a live preview of the
 * question, with the filter they edit applied. Depending on the prototype
 * setting, the preview shows next to the filter controls, or on the main
 * chart (see [[useMainChartFilterPreview]]).
 */
export function FilterLivePreviewProvider({
  question,
  result,
  children,
}: FilterLivePreviewProviderProps) {
  const [mainPreviewQuery, setMainPreviewQuery] = useState<Lib.Query | null>(
    null,
  );

  const filterPreview = useMemo<FilterPreviewContextValue>(
    () => ({
      renderPreview: (props) => (
        <FilterPreviewSlot
          {...props}
          question={question}
          result={result}
          onMainPreviewQueryChange={setMainPreviewQuery}
        />
      ),
      renderFooterLabel: (props) => (
        <MainChartPreviewFooterLabel {...props} question={question} />
      ),
    }),
    [question, result],
  );

  const mainChartPreview = useMemo<MainChartPreview>(
    () => ({ question, result, previewQuery: mainPreviewQuery }),
    [question, result, mainPreviewQuery],
  );

  return (
    <FilterPreviewContext.Provider value={filterPreview}>
      <MainChartPreviewContext.Provider value={mainChartPreview}>
        {children}
      </MainChartPreviewContext.Provider>
    </FilterPreviewContext.Provider>
  );
}

interface FilterPreviewSlotProps extends FilterPreviewProps {
  question: Question;
  result: Dataset | null;
  onMainPreviewQueryChange: (query: Lib.Query | null) => void;
}

function FilterPreviewSlot({
  question,
  result,
  query,
  stageIndex,
  filter,
  draftFilter,
  onMainPreviewQueryChange,
}: FilterPreviewSlotProps) {
  const previewQuery = useMemo(
    () => getPreviewQuery(query, stageIndex, filter, draftFilter),
    [query, stageIndex, filter, draftFilter],
  );
  const mode = usePreviewMode(previewQuery);

  if (mode === "off") {
    return null;
  }

  if (mode === "main-chart") {
    return (
      <MainChartPreviewReporter
        previewQuery={previewQuery}
        onChange={onMainPreviewQueryChange}
      />
    );
  }

  return (
    <PopoverFilterPreview
      question={question}
      result={result}
      previewQuery={previewQuery}
      hasDraft={draftFilter != null}
    />
  );
}

/** The preview mode from the prototype setting, or "off" for slow data. */
function usePreviewMode(previewQuery: Lib.Query): string {
  const [mode] = usePrototypeSetting(LIVE_FILTER_PREVIEW_MODE);
  const [isEnabledForSlowData] = usePrototypeSetting(
    LIVE_FILTER_PREVIEW_SLOW_DATA,
  );
  const prototypeData = useSetting("prototype-data");
  const isSlow = useMemo(
    () => readsSlowTable(previewQuery, prototypeData),
    [previewQuery, prototypeData],
  );
  return isSlow && !isEnabledForSlowData ? "off" : mode;
}

interface MainChartPreviewFooterLabelProps extends FilterPreviewProps {
  question: Question;
}

// In the main chart mode, the label tells that the main chart shows a preview.
// It keeps its space while hidden, so the footer does not move.
function MainChartPreviewFooterLabel({
  question,
  query,
  stageIndex,
  filter,
  draftFilter,
}: MainChartPreviewFooterLabelProps) {
  const previewQuery = useMemo(
    () => getPreviewQuery(query, stageIndex, filter, draftFilter),
    [query, stageIndex, filter, draftFilter],
  );
  const mode = usePreviewMode(previewQuery);
  const isPreview = useMemo(
    () => !areQueriesEqual(previewQuery, question.query()),
    [previewQuery, question],
  );

  if (mode !== "main-chart") {
    return null;
  }

  return (
    <Flex
      align="center"
      gap="xs"
      c="core-brand"
      style={{ visibility: isPreview ? "visible" : "hidden" }}
      data-testid="main-chart-preview-label"
    >
      <Icon name="eye" />
      <Text c="core-brand" fw="bold" size="sm">
        {t`Live preview until you apply`}
      </Text>
    </Flex>
  );
}

interface MainChartPreviewReporterProps {
  previewQuery: Lib.Query;
  onChange: (query: Lib.Query | null) => void;
}

// While the filter picker is open, the main chart shows its preview. When the
// picker closes, with or without applying the filter, the main chart comes back.
function MainChartPreviewReporter({
  previewQuery,
  onChange,
}: MainChartPreviewReporterProps) {
  useEffect(() => {
    onChange(previewQuery);
  }, [previewQuery, onChange]);

  useEffect(() => () => onChange(null), [onChange]);

  return null;
}

interface PopoverFilterPreviewProps {
  question: Question;
  result: Dataset | null;
  previewQuery: Lib.Query;
  hasDraft: boolean;
}

function PopoverFilterPreview({
  question,
  result,
  previewQuery,
  hasDraft,
}: PopoverFilterPreviewProps) {
  const { rawSeries, errorMessage, isUpdating, chartAnimation } =
    usePreviewSeries(question, result, previewQuery);

  return (
    <Stack
      w={POPOVER_PREVIEW_WIDTH}
      p="md"
      gap="sm"
      bg="background_page-secondary"
      style={{ borderLeft: "1px solid var(--mb-color-border-neutral)" }}
      data-testid="filter-live-preview"
    >
      <Flex justify="space-between" align="center">
        <Text fw="bold" size="sm" c="text-secondary">
          {hasDraft ? t`Preview` : t`Current result`}
        </Text>
        {isUpdating && <Loader size="xs" />}
      </Flex>
      <Box
        h={POPOVER_CHART_HEIGHT}
        pos="relative"
        bg="background_page-primary"
        style={{
          borderRadius: "var(--mantine-radius-md)",
          opacity: isUpdating && rawSeries && !chartAnimation ? 0.6 : 1,
          transition: "opacity 150ms",
        }}
      >
        <PreviewChart
          rawSeries={rawSeries}
          errorMessage={errorMessage}
          chartAnimation={chartAnimation}
          isDashboard
        />
      </Box>
      {rawSeries && (
        <Text size="xs" c="text-secondary">
          {getRowCountLabel(rawSeries)}
        </Text>
      )}
    </Stack>
  );
}

// How long to wait, after the picker closes, for the question to change to the
// previewed query. updateQuestion is async, so it can come a render later.
const APPLY_GRACE_MS = 150;

interface HeldPreview {
  series: RawSeries;
  result: Dataset | null;
}

export interface MainChartFilterPreviewState {
  /** The series for the main chart, or undefined to show its own result. */
  rawSeries: RawSeries | undefined;
  /** Chart animation for the main chart while the preview changes it. */
  chartAnimation: ChartAnimation | null;
  isUpdating: boolean;
}

/**
 * Prototype: what the main chart of the query builder shows while a filter
 * picker previews on it. The main chart keeps its own result until the preview
 * differs from it, so that opening a filter picker does not change the chart.
 * When the picker closes without applying, the chart animates back. When it
 * closes because the filter was applied, the preview stays until the new
 * result of the question arrives, so the chart does not jump back first.
 */
export function useMainChartFilterPreview(): MainChartFilterPreviewState {
  const mainChartPreview = useContext(MainChartPreviewContext);
  const question = mainChartPreview?.question ?? null;
  const result = mainChartPreview?.result ?? null;
  const previewQuery = mainChartPreview?.previewQuery ?? null;

  const { rawSeries, isQuestionQuery, isUpdating, chartAnimation } =
    usePreviewSeries(question, result, previewQuery);
  const previewSeries =
    previewQuery != null && !isQuestionQuery ? rawSeries : undefined;

  // The last preview the main chart showed, while it differs from the question.
  const [shownSeries, setShownSeries] = useState<RawSeries>();
  // A preview that stays on screen after the filter was applied, until the
  // question has its new result.
  const [held, setHeld] = useState<HeldPreview | null>(null);
  // The picker closed: wait a moment to see if it applied the filter.
  const [isClosing, setIsClosing] = useState(false);
  const [isAnimatingBack, setIsAnimatingBack] = useState(false);
  const [lastQuestion, setLastQuestion] = useState(question);
  const [lastPreviewQuery, setLastPreviewQuery] = useState(previewQuery);

  // These run during render on purpose: the chart must keep the preview in the
  // same render in which the filter is applied, or it jumps back for a frame.
  if (previewSeries != null && previewSeries !== shownSeries) {
    setShownSeries(previewSeries);
  }
  if (previewQuery != null && previewSeries == null && shownSeries != null) {
    // Back to the question's own query while the picker is still open.
    if (question === lastQuestion) {
      setShownSeries(undefined);
    }
  }
  if (question !== lastQuestion) {
    const isApplied =
      shownSeries != null &&
      lastQuestion != null &&
      question != null &&
      !areQueriesEqual(question.query(), lastQuestion.query());
    if (isApplied) {
      setHeld({ series: shownSeries, result });
      setShownSeries(undefined);
      setIsClosing(false);
    }
    setLastQuestion(question);
  }
  if (previewQuery !== lastPreviewQuery) {
    if (previewQuery == null && shownSeries != null && held == null) {
      setIsClosing(true);
    }
    setLastPreviewQuery(previewQuery);
  }

  // Applied: release the preview when the question has its new result.
  useEffect(() => {
    if (held != null && result != null && result !== held.result) {
      setHeld(null);
    }
  }, [held, result]);

  // Closed without applying: the chart animates back to its own result.
  useEffect(() => {
    if (!isClosing) {
      return;
    }
    const timeoutId = setTimeout(() => {
      setIsClosing(false);
      setShownSeries(undefined);
      setIsAnimatingBack(true);
    }, APPLY_GRACE_MS);
    return () => clearTimeout(timeoutId);
  }, [isClosing]);

  useEffect(() => {
    if (!isAnimatingBack) {
      return;
    }
    const timeoutId = setTimeout(
      () => setIsAnimatingBack(false),
      (chartAnimation?.durationMs ?? 0) + 100,
    );
    return () => clearTimeout(timeoutId);
  }, [isAnimatingBack, chartAnimation]);

  const isActive =
    previewQuery != null || held != null || isClosing || isAnimatingBack;
  return {
    rawSeries:
      previewSeries ??
      held?.series ??
      (isClosing || previewQuery != null ? shownSeries : undefined),
    chartAnimation: isActive ? chartAnimation : null,
    isUpdating: previewQuery != null && isUpdating,
  };
}

interface PreviewChartProps {
  rawSeries: RawSeries | undefined;
  errorMessage: string | undefined;
  chartAnimation: ChartAnimation | null;
  isDashboard?: boolean;
}

function PreviewChart({
  rawSeries,
  errorMessage,
  chartAnimation,
  isDashboard,
}: PreviewChartProps) {
  if (errorMessage) {
    return (
      <Center h="100%" p="md">
        <Text c="text-secondary" ta="center">
          {errorMessage}
        </Text>
      </Center>
    );
  }
  if (!rawSeries) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }
  return (
    <ChartAnimationContext.Provider value={chartAnimation}>
      <Visualization
        rawSeries={rawSeries}
        isDashboard={isDashboard}
        showTitle={false}
      />
    </ChartAnimationContext.Provider>
  );
}

/**
 * The series to show for `previewQuery`: the question's own result while the
 * query is unchanged (or there is no preview query), otherwise the result of an
 * ad-hoc query, after the prototype delay. While a new result loads, the last
 * one stays on screen.
 */
function usePreviewSeries(
  question: Question | null,
  result: Dataset | null,
  previewQuery: Lib.Query | null,
) {
  const [delayMs] = usePrototypeSetting(LIVE_FILTER_PREVIEW_DELAY_MS);
  const [isAnimated] = usePrototypeSetting(LIVE_FILTER_PREVIEW_ANIMATION);
  const [animationMs] = usePrototypeSetting(LIVE_FILTER_PREVIEW_ANIMATION_MS);
  const chartAnimation = useMemo(
    () => (isAnimated ? { durationMs: animationMs } : null),
    [isAnimated, animationMs],
  );

  const [debouncedQuery] = useDebouncedValue(previewQuery, delayMs);
  const isDebouncing = debouncedQuery !== previewQuery;
  const isQuestionQuery = useMemo(
    () =>
      question == null ||
      debouncedQuery == null ||
      areQueriesEqual(debouncedQuery, question.query()),
    [debouncedQuery, question],
  );
  const jsQuery = useMemo(
    () =>
      !isQuestionQuery && debouncedQuery != null
        ? Lib.toJsQuery(debouncedQuery)
        : null,
    [isQuestionQuery, debouncedQuery],
  );

  const { data, error, isFetching } = useGetAdhocQueryQuery(
    jsQuery != null ? { ...jsQuery, ignore_error: true } : skipToken,
  );

  const rawSeries = useMemo((): RawSeries | undefined => {
    if (question == null) {
      return undefined;
    }
    if (isQuestionQuery || debouncedQuery == null) {
      return result?.data
        ? [{ card: question.card(), data: result.data }]
        : undefined;
    }
    if (!data?.data || data.status === "failed") {
      return undefined;
    }
    return [
      { card: question.setQuery(debouncedQuery).card(), data: data.data },
    ];
  }, [isQuestionQuery, result, data, question, debouncedQuery]);

  const [lastRawSeries, setLastRawSeries] = useState(rawSeries);
  useEffect(() => {
    if (rawSeries) {
      setLastRawSeries(rawSeries);
    }
  }, [rawSeries]);
  const shownSeries = rawSeries ?? lastRawSeries;

  const [onionSkinStyle] = usePrototypeSetting(LIVE_FILTER_PREVIEW_ONION_SKIN);
  const currentSeries = useMemo(
    (): RawSeries | undefined =>
      question != null &&
      !isQuestionQuery &&
      onionSkinStyle !== "off" &&
      result?.data
        ? [{ card: question.card(), data: result.data }]
        : undefined,
    [question, isQuestionQuery, onionSkinStyle, result],
  );

  const seriesWithGhost = useMemo(() => {
    if (!shownSeries || !currentSeries || currentSeries === shownSeries) {
      return shownSeries;
    }
    return onionSkinStyle === "difference"
      ? withDifference(shownSeries, currentSeries)
      : withOnionSkin(shownSeries, currentSeries);
  }, [shownSeries, currentSeries, onionSkinStyle]);

  const errorMessage =
    !isQuestionQuery && error
      ? getErrorMessage(error)
      : !isQuestionQuery && data?.status === "failed"
        ? t`The preview query failed`
        : undefined;

  return {
    rawSeries: seriesWithGhost,
    isQuestionQuery: isQuestionQuery && !isDebouncing,
    errorMessage,
    isUpdating: isDebouncing || (!isQuestionQuery && isFetching),
    chartAnimation,
  };
}

const ONION_SKIN_DISPLAYS = new Set(["bar", "row", "line", "area", "combo"]);

/**
 * Adds `ghostSeries` behind `series` as a second, grey series of the same
 * chart, so that both share the axes. Charts that cannot combine series, and
 * results with more than one series, get no ghost.
 */
function withOnionSkin(series: RawSeries, ghostSeries: RawSeries): RawSeries {
  const [main] = series;
  const [ghost] = ghostSeries;
  if (
    main == null ||
    ghost == null ||
    series.length !== 1 ||
    ghostSeries.length !== 1 ||
    !ONION_SKIN_DISPLAYS.has(main.card.display)
  ) {
    return series;
  }

  const settings = main.card.visualization_settings;
  const metricColumn = main.data.cols.find(
    (column) => column.source === "aggregation",
  );
  if (metricColumn == null) {
    return series;
  }

  // Combined cards key their series settings by the metric column name for the
  // first card, and by the card name for the others.
  const ghostKey = metricColumn.name;
  const previewName = t`Preview`;
  const previewColor =
    settings.series_settings?.[ghostKey]?.color ??
    getColorsForValues([ghostKey])[ghostKey];

  // The ghost goes first: the x axis keeps the order of the first series, and
  // the ghost has every value the preview has, and maybe more.
  return [
    {
      ...ghost,
      // The ghost is a copy of the same question; a different id keeps the
      // two series apart.
      card: {
        ...ghost.card,
        id: -1,
        name: t`Before`,
        visualization_settings: {
          ...settings,
          // Bars of the preview cover most of the ghost bars behind them.
          "graph.bar_overlap": 0.8,
          series_settings: {
            ...settings.series_settings,
            [ghostKey]: {
              ...settings.series_settings?.[ghostKey],
              title: t`Before`,
              // Solid grey: chart series colours do not support transparency.
              color: staticVizOverrides["text-disabled"],
              "line.style": "dashed",
              "bar.behind": true,
            },
            [previewName]: { color: previewColor },
          },
        },
      },
    },
    { ...main, card: { ...main.card, name: previewName } },
  ];
}

const DIFFERENCE_DISPLAYS: Partial<Record<string, CardDisplayType>> = {
  bar: "bar",
  row: "row",
  // Stacked areas fill the space between the two values.
  line: "area",
};

interface ChangeColumn {
  name: string;
  isIncrease: boolean;
  // When the value changes sign, the change has a part on each side of zero.
  isOtherSide: boolean;
}

const CHANGE_COLUMNS: readonly ChangeColumn[] = [
  { name: "onion_skin_increase", isIncrease: true, isOtherSide: false },
  { name: "onion_skin_decrease", isIncrease: false, isOtherSide: false },
  { name: "onion_skin_increase_other", isIncrease: true, isOtherSide: true },
  { name: "onion_skin_decrease_other", isIncrease: false, isOtherSide: true },
];

/**
 * The values of the stacked parts for one dimension value: the part that both
 * values share, then one value for each of CHANGE_COLUMNS. Positive and
 * negative values stack separately from zero, so the parts have the sign of
 * the side of zero they are on.
 */
function getDifferenceParts(
  currentValue: number,
  previewValue: number,
): number[] {
  const isIncrease = previewValue > currentValue;
  const isSameSide = currentValue * previewValue >= 0;
  const sharedValue = !isSameSide
    ? 0
    : Math.abs(currentValue) < Math.abs(previewValue)
      ? currentValue
      : previewValue;
  const otherValue = sharedValue === currentValue ? previewValue : currentValue;
  // If the sign changes, nothing is shared: the change goes from zero to the
  // preview value on one side, and from zero to the current value on the other.
  const change = isSameSide ? otherValue - sharedValue : previewValue;
  const otherSideChange = isSameSide ? 0 : currentValue;

  return [
    sharedValue,
    ...CHANGE_COLUMNS.map((column) =>
      column.isIncrease !== isIncrease
        ? 0
        : column.isOtherSide
          ? otherSideChange
          : change,
    ),
  ];
}

/**
 * Shows `series` and `currentSeries` as one stacked chart: for each dimension
 * value, the part that both values share, and next to it the change from the
 * current value to the preview value, green for an increase and red for a
 * decrease. A dimension value that only one of the results has counts as 0 in
 * the other. Only for bar, row and line charts with one dimension and one
 * metric.
 */
function withDifference(
  series: RawSeries,
  currentSeries: RawSeries,
): RawSeries {
  const [preview] = series;
  const [current] = currentSeries;
  const display =
    preview != null ? DIFFERENCE_DISPLAYS[preview.card.display] : undefined;
  if (
    preview == null ||
    current == null ||
    display == null ||
    series.length !== 1 ||
    currentSeries.length !== 1
  ) {
    return series;
  }

  const { cols } = preview.data;
  const dimensionColumns = cols.filter(
    (column) => column.source === "breakout",
  );
  const metricColumns = cols.filter(
    (column) => column.source === "aggregation",
  );
  const [dimensionColumn] = dimensionColumns;
  const [metricColumn] = metricColumns;
  if (
    dimensionColumn == null ||
    metricColumn == null ||
    dimensionColumns.length !== 1 ||
    metricColumns.length !== 1
  ) {
    return series;
  }

  const currentValues = getMetricValues(
    current.data,
    dimensionColumn,
    metricColumn,
  );
  const previewValues = getMetricValues(
    preview.data,
    dimensionColumn,
    metricColumn,
  );
  const dimensionValues = [
    ...new Set([...currentValues.keys(), ...previewValues.keys()]),
  ];
  if (isDate(dimensionColumn) || isNumeric(dimensionColumn)) {
    dimensionValues.sort(compareDimensionValues);
  }

  const rows = dimensionValues.map((value) => {
    const parts = getDifferenceParts(
      currentValues.get(value) ?? 0,
      previewValues.get(value) ?? 0,
    );
    // Bars have a minimum height, so an empty part must be null, not 0, or it
    // shows as a thin line. Stacked areas need 0 to stay continuous.
    return [
      value,
      ...(display === "area"
        ? parts
        : parts.map((part) => (part === 0 ? null : part))),
    ];
  });

  // The extra columns have no field ref: they are not in the query.
  const { field_ref: _fieldRef, ...metricColumnWithoutRef } = metricColumn;
  const settings = preview.card.visualization_settings;
  return [
    {
      card: {
        ...preview.card,
        display,
        visualization_settings: {
          ...settings,
          "graph.dimensions": [dimensionColumn.name],
          "graph.metrics": [
            metricColumn.name,
            ...CHANGE_COLUMNS.map((column) => column.name),
          ],
          "stackable.stack_type": "stacked",
          series_settings: {
            ...settings.series_settings,
            ...Object.fromEntries(
              CHANGE_COLUMNS.map((column) => [
                column.name,
                {
                  title: getChangeTitle(column),
                  color: column.isIncrease
                    ? colors["feedback-positive"]
                    : colors["feedback-negative"],
                  // A zero change would draw its line over the line of the
                  // shared part.
                  "line.hidden": true,
                  "legend.hidden": column.isOtherSide,
                },
              ]),
            ),
          },
        },
      },
      data: {
        ...preview.data,
        cols: [
          dimensionColumn,
          metricColumn,
          ...CHANGE_COLUMNS.map((column) => ({
            ...metricColumnWithoutRef,
            name: column.name,
            display_name: getChangeTitle(column),
          })),
        ],
        rows,
      },
    },
  ];
}

function getChangeTitle(column: ChangeColumn): string {
  return column.isIncrease ? t`Increase` : t`Decrease`;
}

function getMetricValues(
  data: DatasetData,
  dimensionColumn: DatasetColumn,
  metricColumn: DatasetColumn,
): Map<RowValue, number> {
  const dimensionIndex = data.cols.findIndex(
    (column) => column.name === dimensionColumn.name,
  );
  const metricIndex = data.cols.findIndex(
    (column) => column.name === metricColumn.name,
  );
  const values = new Map<RowValue, number>();
  data.rows.forEach((row) => {
    const metricValue = row[metricIndex];
    values.set(
      row[dimensionIndex],
      typeof metricValue === "number" ? metricValue : 0,
    );
  });
  return values;
}

// Dates come as ISO strings, which sort in time order.
function compareDimensionValues(value1: RowValue, value2: RowValue): number {
  if (typeof value1 === "number" && typeof value2 === "number") {
    return value1 - value2;
  }
  return String(value1).localeCompare(String(value2));
}

export function getPreviewQuery(
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

// Pickers build new clauses, with new ids and slightly different field refs,
// so the same filter must be compared by meaning, not by value.
export function areQueriesEqual(query1: Lib.Query, query2: Lib.Query): boolean {
  return Lib.areLegacyQueriesEqual(
    Lib.toJsQuery(query1),
    Lib.toJsQuery(query2),
  );
}

export function readsSlowTable(
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
