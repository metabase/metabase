import { type EChartsType, getInstanceByDom } from "echarts/core";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  NumberInput,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type { FilterCanvasProps } from "../../types";
import S from "../chart-filters/ChartFilters.module.css";
import { QuestionChart } from "../chart-filters/QuestionChart";
import {
  LandedFlash,
  QuestionShell,
  useQuestionHistory,
} from "../chart-filters/QuestionShell";
import { ExpressionBar } from "../expression-bar-unified/ExpressionBar";

import H from "./ChartHandles.module.css";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;
const GEOMETRY_POLL_MS = 250;
/** Dragging snaps to a hundredth of the biggest value's order of magnitude. */
const SNAP_DIGITS = 2;

type ThresholdOperator = ">=" | "<=" | ">" | "<";
const THRESHOLD_OPERATORS: ThresholdOperator[] = [">=", "<=", ">", "<"];

const OPERATOR_SYMBOLS: Record<ThresholdOperator, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
};

type Handle = {
  clause: Lib.FilterClause;
  operator: ThresholdOperator;
  column: Lib.ColumnMetadata;
  /** The result column's name, e.g. "sum". */
  columnName: string;
  displayName: string;
  value: number;
};

type Display = "bar" | "table";

function isThresholdOperator(
  operator: Lib.NumberFilterOperator,
): operator is ThresholdOperator {
  return THRESHOLD_OPERATORS.some((candidate) => candidate === operator);
}

/** Every single-value comparison on a summary column: these become lines. */
function getHandles(query: Lib.Query): Handle[] {
  if (Lib.stageCount(query) <= SUMMARY_STAGE) {
    return [];
  }
  return Lib.filters(query, SUMMARY_STAGE).flatMap((clause) => {
    const parts = Lib.numberFilterParts(query, SUMMARY_STAGE, clause);
    const value = parts?.values[0];
    if (
      !parts ||
      !isThresholdOperator(parts.operator) ||
      parts.values.length !== 1 ||
      typeof value !== "number"
    ) {
      return [];
    }
    const info = Lib.displayInfo(query, SUMMARY_STAGE, parts.column);
    return [
      {
        clause,
        operator: parts.operator,
        column: parts.column,
        columnName: info.name,
        displayName: info.displayName,
        value,
      },
    ];
  });
}

function passes(value: RowValue, operator: ThresholdOperator, limit: number) {
  if (typeof value !== "number") {
    return false;
  }
  switch (operator) {
    case ">=":
      return value >= limit;
    case "<=":
      return value <= limit;
    case ">":
      return value > limit;
    case "<":
      return value < limit;
  }
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function getLabel(handle: Handle, value = handle.value) {
  return `${handle.displayName} ${OPERATOR_SYMBOLS[handle.operator]} ${formatNumber(value)}`;
}

function getPhrase(handle: Handle, noun: string, value = handle.value) {
  const formatted = formatNumber(value);
  switch (handle.operator) {
    case ">=":
      return t`Only ${noun} where ${handle.displayName} is ${formatted} or more`;
    case "<=":
      return t`Only ${noun} where ${handle.displayName} is ${formatted} or less`;
    case ">":
      return t`Only ${noun} where ${handle.displayName} is more than ${formatted}`;
    case "<":
      return t`Only ${noun} where ${handle.displayName} is less than ${formatted}`;
  }
}

function withValue(query: Lib.Query, handle: Handle, value: number) {
  return Lib.replaceClause(
    query,
    SUMMARY_STAGE,
    handle.clause,
    Lib.numberFilterClause({
      operator: handle.operator,
      column: handle.column,
      values: [value],
    }),
  );
}

function addThreshold(
  query: Lib.Query,
  columnName: string,
  operator: ThresholdOperator,
  value: number,
) {
  const staged =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const column = Lib.filterableColumns(staged, SUMMARY_STAGE).find(
    (candidate) =>
      Lib.displayInfo(staged, SUMMARY_STAGE, candidate).name === columnName,
  );
  return column
    ? Lib.filter(
        staged,
        SUMMARY_STAGE,
        Lib.numberFilterClause({ operator, column, values: [value] }),
      )
    : query;
}

function snap(value: number, max: number) {
  const magnitude = Math.floor(Math.log10(Math.max(Math.abs(max), 1)));
  const step = 10 ** Math.max(magnitude - SNAP_DIGITS, 0);
  return Math.round(value / step) * step;
}

/**
 * Summary filters never sit in a bar: each threshold is a line on the chart,
 * dragged to change, removed with ×. The bar above holds the rows only.
 */
export function ChartHandlesCanvas({
  query,
  onChange,
  heading,
}: FilterCanvasProps) {
  const question = useQuestionHistory(query, onChange);
  const [display, setDisplay] = useState<Display>("bar");
  const handles = useMemo(() => getHandles(query), [query]);

  return (
    <QuestionShell
      query={query}
      heading={heading}
      canGoBack={question.canGoBack}
      onBack={question.back}
      settings={
        <SegmentedControl
          value={display}
          onChange={(value) => setDisplay(value === "table" ? "table" : "bar")}
          data={[
            { value: "bar", label: t`Bar` },
            { value: "table", label: t`Table` },
          ]}
        />
      }
    >
      <Box
        pos="relative"
        px="xl"
        py="md"
        style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
      >
        {question.landed === "rows" && (
          <LandedFlash landedKey={question.landedKey} />
        )}
        <ExpressionBar
          query={query}
          stageIndex={ROWS_STAGE}
          onChange={onChange}
          withSummary={false}
          actionsPlacement="inline"
        />
      </Box>
      <Box p="lg">
        {display === "bar" ? (
          <BarWithHandles
            query={query}
            handles={handles}
            landedKey={
              question.landed === "summary" ? question.landedKey : undefined
            }
            onChange={onChange}
            onPick={question.apply}
          />
        ) : (
          <TableWithHeaderMenu
            query={query}
            handles={handles}
            onChange={onChange}
            onPick={question.apply}
          />
        )}
      </Box>
    </QuestionShell>
  );
}

type ChartProps = {
  query: Lib.Query;
  handles: Handle[];
  onChange: (query: Lib.Query) => void;
  onPick: Parameters<typeof QuestionChart>[0]["onPick"];
};

type Rect = { x: number; y: number; width: number; height: number };
type BarSeries = { name: string; yAxisIndex: number; rects: Rect[] };
type Geometry = {
  chart: EChartsType;
  /** Where the chart's canvas sits inside the overlay. */
  offsetX: number;
  offsetY: number;
  series: BarSeries[];
};

type SeriesModelLike = {
  subType: string;
  name: string;
  get: (key: string) => unknown;
  getData: () => {
    count: () => number;
    getItemLayout: (index: number) => Rect | undefined;
  };
};

/** Bar rectangles straight from ECharts; its model is private, hence the bracket access. */
function readBarSeries(chart: EChartsType): BarSeries[] {
  // ECharts doesn't export its model's types; this is the slice we read.
  const model = chart["getModel"]() as {
    getSeries: () => SeriesModelLike[];
  };
  return model
    .getSeries()
    .filter((series) => series.subType === "bar")
    .map((series) => {
      const data = series.getData();
      const rects = Array.from({ length: data.count() }, (_, index) =>
        data.getItemLayout(index),
      ).filter((rect): rect is Rect => rect != null);
      const yAxisIndex = series.get("yAxisIndex");
      return {
        name: series.name,
        yAxisIndex: typeof yAxisIndex === "number" ? yAxisIndex : 0,
        rects,
      };
    });
}

/** Polls the chart under `overlayRef`: ECharts re-renders on its own schedule. */
function useChartGeometry(overlayRef: RefObject<HTMLDivElement>) {
  const [geometry, setGeometry] = useState<Geometry>();
  const signature = useRef("");

  useEffect(() => {
    const read = () => {
      const overlay = overlayRef.current;
      const dom = overlay?.parentElement?.querySelector<HTMLElement>(
        "[_echarts_instance_]",
      );
      const chart = dom ? getInstanceByDom(dom) : undefined;
      if (!overlay || !dom || !chart || chart.isDisposed()) {
        signature.current = "";
        setGeometry(undefined);
        return;
      }
      const overlayRect = overlay.getBoundingClientRect();
      const domRect = dom.getBoundingClientRect();
      const series = readBarSeries(chart);
      const next = {
        chart,
        offsetX: domRect.left - overlayRect.left,
        offsetY: domRect.top - overlayRect.top,
        series,
      };
      const nextSignature = JSON.stringify([
        chart.id,
        next.offsetX,
        next.offsetY,
        series,
        chart.convertToPixel({ yAxisIndex: 0 }, 0),
      ]);
      if (nextSignature !== signature.current) {
        signature.current = nextSignature;
        setGeometry(next);
      }
    };
    read();
    const interval = setInterval(read, GEOMETRY_POLL_MS);
    return () => clearInterval(interval);
  }, [overlayRef]);

  return geometry;
}

type BarWithHandlesProps = ChartProps & { landedKey?: number };

function BarWithHandles({
  query,
  handles,
  landedKey,
  onChange,
  onPick,
}: BarWithHandlesProps) {
  // The chart leaves the thresholds out, so the bars they hide can be shown faded.
  const chartQuery = useMemo(
    () =>
      handles.reduce(
        (next, handle) => Lib.removeClause(next, SUMMARY_STAGE, handle.clause),
        query,
      ),
    [query, handles],
  );
  const jsQuery = useMemo(() => Lib.toJsQuery(chartQuery), [chartQuery]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const cols = result.data?.data?.cols ?? [];
  const rows = result.data?.data?.rows ?? [];

  const overlayRef = useRef<HTMLDivElement>(null);
  const geometry = useChartGeometry(overlayRef);
  const [drag, setDrag] = useState<{ index: number; value: number }>();

  const valueOf = (handle: Handle, index: number) =>
    drag?.index === index ? drag.value : handle.value;
  const columnIndexOf = (handle: Handle) =>
    cols.findIndex((col) => col.name === handle.columnName);

  const keptRows = rows.map((row) =>
    handles.every((handle, index) => {
      const columnIndex = columnIndexOf(handle);
      return (
        columnIndex < 0 ||
        passes(row[columnIndex], handle.operator, valueOf(handle, index))
      );
    }),
  );
  const keptCount = keptRows.filter(Boolean).length;

  const seriesFor = (handle: Handle) => {
    const displayName = cols[columnIndexOf(handle)]?.display_name;
    return (
      geometry?.series.find((series) => series.name === displayName) ??
      geometry?.series[0]
    );
  };
  const maxOf = (handle: Handle) => {
    const columnIndex = columnIndexOf(handle);
    return Math.max(
      ...rows.map((row) => Number(row[columnIndex]) || 0),
      handle.value,
    );
  };

  const allRects = geometry?.series.flatMap((series) => series.rects) ?? [];
  const plotLeft = Math.min(...allRects.map((rect) => rect.x));
  const plotRight = Math.max(...allRects.map((rect) => rect.x + rect.width));
  const hasPlot = geometry != null && allRects.length > 0;

  return (
    <Box pos="relative">
      <QuestionChart
        query={chartQuery}
        pickQuery={query}
        display="bar"
        onPick={onPick}
      />
      <Box
        ref={overlayRef}
        pos="absolute"
        inset={0}
        style={{ pointerEvents: "none" }}
      >
        {hasPlot &&
          geometry.series.flatMap((series, seriesIndex) =>
            series.rects.map((rect, rowIndex) =>
              keptRows[rowIndex] === false ? (
                <Box
                  key={`${seriesIndex}-${rowIndex}`}
                  className={H.fade}
                  pos="absolute"
                  left={geometry.offsetX + rect.x}
                  top={
                    geometry.offsetY + Math.min(rect.y, rect.y + rect.height)
                  }
                  w={rect.width}
                  h={Math.abs(rect.height)}
                />
              ) : null,
            ),
          )}
        {hasPlot &&
          handles.map((handle, index) => {
            const series = seriesFor(handle);
            const yAxisIndex = series?.yAxisIndex ?? 0;
            const value = valueOf(handle, index);
            const y =
              geometry.offsetY +
              geometry.chart.convertToPixel({ yAxisIndex }, value);
            const isDragging = drag?.index === index;
            const isLanded = landedKey != null && index === handles.length - 1;

            const toValue = (event: PointerEvent<HTMLElement>) => {
              const overlayTop =
                overlayRef.current?.getBoundingClientRect().top ?? 0;
              const chartY = event.clientY - overlayTop - geometry.offsetY;
              return snap(
                geometry.chart.convertFromPixel({ yAxisIndex }, chartY),
                maxOf(handle),
              );
            };
            const remove = () =>
              onChange(Lib.removeClause(query, SUMMARY_STAGE, handle.clause));

            return (
              <Tooltip
                key={`${index}-${landedKey ?? ""}`}
                label={`${getPhrase(handle, t`bars`, value)} · ${t`${keptCount} of ${rows.length} bars`}`}
                position="top-start"
                disabled={isDragging}
              >
                <Box
                  className={isLanded ? `${H.handle} ${H.landed}` : H.handle}
                  data-dragging={isDragging || undefined}
                  pos="absolute"
                  left={geometry.offsetX + plotLeft}
                  w={plotRight - plotLeft}
                  top={y}
                  tabIndex={0}
                  role="slider"
                  aria-label={getLabel(handle)}
                  aria-valuenow={value}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDrag({ index, value: handle.value });
                  }}
                  onPointerMove={(event) => {
                    if (isDragging) {
                      setDrag({ index, value: toValue(event) });
                    }
                  }}
                  onPointerUp={(event) => {
                    if (!isDragging) {
                      return;
                    }
                    setDrag(undefined);
                    const nextValue = toValue(event);
                    if (nextValue !== handle.value) {
                      onChange(withValue(query, handle, nextValue));
                    }
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                    if (event.key === "Delete" || event.key === "Backspace") {
                      remove();
                    }
                  }}
                >
                  <Box className={H.line} />
                  <Group className={H.label} gap={4} wrap="nowrap">
                    <Text size="xs" fw="bold" c="inherit">
                      {getLabel(handle, value)}
                    </Text>
                    <ActionIcon
                      className={H.remove}
                      size="xs"
                      variant="subtle"
                      aria-label={t`Remove`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={remove}
                    >
                      <Icon name="close" size={10} />
                    </ActionIcon>
                  </Group>
                </Box>
              </Tooltip>
            );
          })}
      </Box>
    </Box>
  );
}

type HeaderMenu = {
  column: DatasetColumn;
  rect: DOMRect;
  operator?: ThresholdOperator;
};

/** Tables have no axis to draw on: a measure's header offers the threshold instead. */
function TableWithHeaderMenu({ query, handles, onChange, onPick }: ChartProps) {
  const [menu, setMenu] = useState<HeaderMenu>();

  return (
    <Stack gap="sm">
      {handles.length > 0 && (
        <Group gap="sm">
          {handles.map((handle, index) => (
            <Group key={index} className={S.threshold} gap={4} wrap="nowrap">
              <Text size="sm">{getPhrase(handle, t`rows`)}</Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={t`Remove`}
                onClick={() =>
                  onChange(
                    Lib.removeClause(query, SUMMARY_STAGE, handle.clause),
                  )
                }
              >
                <Icon name="close" size={12} />
              </ActionIcon>
            </Group>
          ))}
        </Group>
      )}
      <QuestionChart
        query={query}
        display="table"
        onPick={onPick}
        onHeaderClick={(column, element) => {
          const isMeasure = column.source === "aggregation";
          setMenu(
            isMeasure
              ? { column, rect: element.getBoundingClientRect() }
              : undefined,
          );
        }}
      />
      {menu && (
        <HeaderThresholdMenu
          query={query}
          menu={menu}
          onOperator={(operator) => setMenu({ ...menu, operator })}
          onClose={() => setMenu(undefined)}
          onAdd={(operator, value) => {
            setMenu(undefined);
            onChange(addThreshold(query, menu.column.name, operator, value));
          }}
        />
      )}
    </Stack>
  );
}

type HeaderThresholdMenuProps = {
  query: Lib.Query;
  menu: HeaderMenu;
  onOperator: (operator: ThresholdOperator) => void;
  onClose: () => void;
  onAdd: (operator: ThresholdOperator, value: number) => void;
};

function HeaderThresholdMenu({
  query,
  menu,
  onOperator,
  onClose,
  onAdd,
}: HeaderThresholdMenuProps) {
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const data = result.data?.data;
  const columnIndex =
    data?.cols.findIndex((col) => col.name === menu.column.name) ?? -1;
  const values = (data?.rows ?? [])
    .map((row) => row[columnIndex])
    .filter((value): value is number => typeof value === "number");
  const average =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  const [value, setValue] = useState<number | string>(
    snap(average, Math.max(...values, 1)),
  );
  const name = menu.column.display_name;

  return (
    <Popover opened onChange={(opened) => !opened && onClose()} width={300}>
      <Popover.Target>
        <Box
          pos="fixed"
          left={menu.rect.left}
          top={menu.rect.bottom}
          w={1}
          h={1}
        />
      </Popover.Target>
      <Popover.Dropdown p="sm">
        {menu.operator == null ? (
          <Stack gap={0}>
            {([">=", "<="] as const).map((operator) => (
              <UnstyledButton
                key={operator}
                className={H.menuItem}
                onClick={() => onOperator(operator)}
              >
                <Text size="sm">
                  {t`Only rows where ${name} ${OPERATOR_SYMBOLS[operator]} …`}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typeof value === "number" && menu.operator) {
                onAdd(menu.operator, value);
              }
            }}
          >
            <Stack gap="sm">
              <Text size="sm" fw="bold">
                {t`Only rows where ${name} ${OPERATOR_SYMBOLS[menu.operator]}`}
              </Text>
              <NumberInput
                autoFocus
                value={value}
                onChange={setValue}
                thousandSeparator=","
              />
              <Button type="submit" variant="filled">
                {t`Add`}
              </Button>
            </Stack>
          </form>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
