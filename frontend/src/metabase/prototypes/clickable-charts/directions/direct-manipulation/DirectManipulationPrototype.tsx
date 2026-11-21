import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Group, Popover, Text, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import { QuestionChart } from "../../harness/QuestionChart";
import type { ChartCanvasProps, Example } from "../../types";
import { Action, MenuDivider, MenuList } from "../axis-side-quest/AxisObjects";

import S from "./LoFi.module.css";
import {
  type CutOperator,
  type XDimension,
  cutX,
  excludeRange,
  filterMeasure,
  formatRange,
  formatX,
  getMeasureName,
  getXDimension,
  onlyRange,
  seeRows,
  zoomIn,
} from "./actions";
import {
  type ChartGeometry,
  type ChartPoint,
  useChartGeometry,
} from "./useChartGeometry";

/** Charts with a value y-axis and one series to read thresholds against. */
const SUPPORTED_DISPLAYS = new Set<CardDisplayType>([
  "line",
  "bar",
  "combo",
  "scatter",
]);

export function supportsDirectManipulation(example: Example) {
  return (
    SUPPORTED_DISPLAYS.has(example.display) &&
    !example.settings?.["stackable.stack_type"]
  );
}

const X_STRIP_HEIGHT = 28;
const SNAP_STEPS = 40;
const DIM_OPACITY = 0.7;
const BAND_OPACITY = 0.08;
/** Pointer travel past which a press on an axis is a drag, not a click. */
const DRAG_DISTANCE = 4;

/**
 * A gesture on one axis. A click places a line (a cut, flippable between ≥
 * and ≤); a drag selects a span between `from` and `to`.
 */
type Gesture = {
  axis: "x" | "y";
  /** y: measure values; x: pixels. */
  from: number;
  to: number;
  startPx: number;
  isRange: boolean;
  isDragging: boolean;
  operator: CutOperator;
};

type YScale = ReturnType<typeof useChartGeometry>["yScale"];
type ApplyQuery = (query: Lib.Query, display?: CardDisplayType) => void;

/**
 * Direction A: the axes are handles. Click an axis to cut it with a line,
 * drag along it to select a span; letting go opens what that can mean.
 */
export function DirectManipulationPrototype(props: ChartCanvasProps) {
  const { query, display, settings, onChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const x = useMemo(() => getXDimension(query), [query]);
  const measureName = useMemo(() => getMeasureName(query), [query]);
  const isSupported =
    SUPPORTED_DISPLAYS.has(display) &&
    !settings["stackable.stack_type"] &&
    Lib.breakouts(query, 0).length === 1 &&
    x != null &&
    measureName != null;

  const { geometry, yScale } = useChartGeometry(containerRef, isSupported);
  const [gesture, setGesture] = useState<Gesture>();
  const [hoverValue, setHoverValue] = useState<number>();
  const [highlight, setHighlight] = useState<unknown[]>();
  const [goal, setGoal] = useState<number>();

  useEffect(() => {
    setGesture(undefined);
    setHighlight(undefined);
    setGoal(undefined);
  }, [query]);

  const chartSettings = useMemo(
    () =>
      goal != null
        ? { ...settings, "graph.show_goal": true, "graph.goal_value": goal }
        : settings,
    [settings, goal],
  );

  const apply: ApplyQuery = (nextQuery, nextDisplay) => {
    setGesture(undefined);
    onChange(nextQuery, nextDisplay);
  };

  const showOverlay = isSupported && geometry && x && measureName;

  return (
    <Box ref={containerRef} pos="relative" className={S.lofi}>
      <QuestionChart {...props} settings={chartSettings} />
      {showOverlay && (
        <Overlay
          geometry={geometry}
          x={x}
          measureName={measureName}
          query={query}
          gesture={gesture}
          hoverValue={hoverValue}
          highlight={highlight}
          containerRef={containerRef}
          isDraggingRef={isDraggingRef}
          yScale={yScale}
          onGesture={setGesture}
          onHover={setHoverValue}
          onHighlight={(values) => {
            setHighlight(values);
            setGesture(undefined);
          }}
          onGoal={(value) => {
            setGoal(value);
            setGesture(undefined);
          }}
          onApply={apply}
        />
      )}
    </Box>
  );
}

type OverlayProps = {
  geometry: ChartGeometry;
  x: XDimension;
  measureName: string;
  query: Lib.Query;
  gesture: Gesture | undefined;
  hoverValue: number | undefined;
  highlight: unknown[] | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  yScale: YScale;
  onGesture: (gesture: Gesture | undefined) => void;
  onHover: (value: number | undefined) => void;
  onHighlight: (values: unknown[]) => void;
  onGoal: (value: number) => void;
  onApply: ApplyQuery;
};

function Overlay({
  geometry,
  x,
  measureName,
  query,
  gesture,
  hoverValue,
  highlight,
  containerRef,
  isDraggingRef,
  yScale,
  onGesture,
  onHover,
  onHighlight,
  onGoal,
  onApply,
}: OverlayProps) {
  const { plot, points, band } = geometry;
  const allValues = points.map((point) => point.x);

  const snap = (py: number) => {
    const top = yScale.valueAt(plot.top);
    const bottom = yScale.valueAt(plot.top + plot.height);
    const step = niceStep(Math.abs(top - bottom) / SNAP_STEPS);
    const value = Math.round(yScale.valueAt(py) / step) * step;
    return Math.min(
      Math.max(value, Math.min(top, bottom)),
      Math.max(top, bottom),
    );
  };
  const localPoint = (event: PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  };

  const startGesture = (event: PointerEvent, axis: "x" | "y") => {
    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    onHover(undefined);
    const { px, py } = localPoint(event);
    const start = axis === "y" ? snap(py) : px;
    onGesture({
      axis,
      from: start,
      to: start,
      startPx: axis === "y" ? py : px,
      isRange: false,
      isDragging: true,
      operator: ">=",
    });
  };
  const moveGesture = (event: PointerEvent, axis: "x" | "y") => {
    const { px, py } = localPoint(event);
    if (gesture?.axis !== axis || !gesture.isDragging) {
      if (axis === "y") {
        onHover(snap(py));
      }
      return;
    }
    const pointer = axis === "y" ? py : px;
    onGesture({
      ...gesture,
      to: axis === "y" ? snap(py) : px,
      isRange:
        gesture.isRange || Math.abs(pointer - gesture.startPx) > DRAG_DISTANCE,
    });
  };
  const endGesture = () => {
    // Let the popover's outside-click pass before it can close the new menu.
    setTimeout(() => (isDraggingRef.current = false));
    if (gesture?.isDragging) {
      onGesture({
        ...gesture,
        // A click is a line at where it started.
        to: gesture.isRange ? gesture.to : gesture.from,
        isDragging: false,
      });
    }
  };

  const kept = gesture
    ? getKept(gesture, points, band)
    : highlight && points.filter((point) => highlight.includes(point.x));
  const keptValues = (kept ?? []).map((point) => point.x);
  const isMenuOpen = gesture != null && !gesture.isDragging;
  const flip = () =>
    gesture &&
    onGesture({
      ...gesture,
      operator: gesture.operator === ">=" ? "<=" : ">=",
    });

  const seeAction = keptValues.length > 0 && (
    <>
      <MenuDivider />
      <Action
        onClick={() =>
          onApply(
            seeRows(
              query,
              x,
              keptValues,
              allValues,
              gesture?.axis === "x" && gesture.isRange,
            ),
            "table",
          )
        }
      >
        {measureName === t`Count`
          ? t`See these ${sumY(kept ?? []).toLocaleString()} orders →`
          : t`See these orders →`}
      </Action>
    </>
  );

  return (
    <>
      {kept && <Dims points={points} kept={kept} plot={plot} band={band} />}

      {gesture?.axis === "y" && (
        <YMarks gesture={gesture} plot={plot} yScale={yScale} />
      )}
      {!gesture && hoverValue != null && (
        <YLine plot={plot} py={yScale.pixelOf(hoverValue)} isGhost />
      )}
      {!gesture && hoverValue != null && (
        <ValuePill left={plot.left - 4} py={yScale.pixelOf(hoverValue)}>
          {formatNumber(hoverValue)}
        </ValuePill>
      )}
      {gesture?.axis === "x" && kept && kept.length > 0 && (
        <XMarks gesture={gesture} kept={kept} plot={plot} band={band} />
      )}

      {gesture?.isDragging && gesture.isRange && kept && (
        <DragTooltip plot={plot}>
          {`${gestureLabel(gesture, x, measureName, kept, points)} · ${kept.length} of ${points.length} ${x.noun}`}
        </DragTooltip>
      )}

      {/* The y-axis: click for a line, drag for a band. */}
      <Box
        pos="absolute"
        left={0}
        top={plot.top}
        w={plot.left}
        h={plot.height}
        style={{ cursor: "ns-resize", zIndex: 2 }}
        onPointerDown={(event) => startGesture(event, "y")}
        onPointerMove={(event) => moveGesture(event, "y")}
        onPointerLeave={() => onHover(undefined)}
        onPointerUp={endGesture}
      />

      {/* The x-axis: click for a cut, drag for a range. */}
      <Box
        pos="absolute"
        left={plot.left}
        top={plot.top + plot.height}
        w={plot.width}
        h={X_STRIP_HEIGHT}
        style={{ cursor: "ew-resize", zIndex: 2 }}
        onPointerDown={(event) => startGesture(event, "x")}
        onPointerMove={(event) => moveGesture(event, "x")}
        onPointerUp={endGesture}
      />

      {isMenuOpen && kept && (
        <Menu
          {...menuAnchor(gesture, kept, plot, band, yScale)}
          isDraggingRef={isDraggingRef}
          onClose={() => onGesture(undefined)}
          title={
            <GestureTitle
              gesture={gesture}
              x={x}
              measureName={measureName}
              kept={kept}
              points={points}
              onFlip={flip}
            />
          }
        >
          {gesture.axis === "y" && (
            <>
              <Action
                onClick={() =>
                  onApply(
                    gesture.isRange
                      ? filterMeasure(query, measureName, "between", [
                          Math.min(gesture.from, gesture.to),
                          Math.max(gesture.from, gesture.to),
                        ])
                      : filterMeasure(query, measureName, gesture.operator, [
                          gesture.from,
                        ]),
                  )
                }
              >{t`Only show these ${x.noun}`}</Action>
              <Action onClick={() => onHighlight(keptValues)}>
                {t`Highlight them`}
              </Action>
              {!gesture.isRange && (
                <Action onClick={() => onGoal(gesture.from)}>
                  {t`Keep as a goal line`}
                </Action>
              )}
            </>
          )}
          {gesture.axis === "x" && gesture.isRange && keptValues.length > 0 && (
            <RangeActions
              query={query}
              x={x}
              selected={keptValues}
              allValues={allValues}
              onApply={onApply}
            />
          )}
          {gesture.axis === "x" && !gesture.isRange && kept.length > 0 && (
            <Action
              onClick={() =>
                onApply(
                  cutX(
                    query,
                    x,
                    gesture.operator,
                    cutPoint(gesture, points)?.x,
                    keptValues,
                  ),
                )
              }
            >{t`Only show these ${x.noun}`}</Action>
          )}
          {seeAction}
        </Menu>
      )}
    </>
  );
}

/** What the gesture keeps: the rest is faded while it's open. */
function getKept(
  gesture: Gesture,
  points: ChartPoint[],
  band: number,
): ChartPoint[] {
  const { from, to, operator } = gesture;
  if (gesture.axis === "y") {
    if (gesture.isRange) {
      const [low, high] = [Math.min(from, to), Math.max(from, to)];
      return points.filter((point) => point.y >= low && point.y <= high);
    }
    return points.filter((point) =>
      operator === ">=" ? point.y >= from : point.y <= from,
    );
  }
  if (gesture.isRange) {
    return pointsInRange(points, from, to, band);
  }
  const cut = cutPoint(gesture, points);
  return cut
    ? points.filter((point) =>
        operator === ">=" ? point.px >= cut.px : point.px <= cut.px,
      )
    : [];
}

/** The x slot a click landed on. */
function cutPoint(gesture: Gesture, points: ChartPoint[]) {
  return points.reduce<ChartPoint | undefined>(
    (best, point) =>
      !best ||
      Math.abs(point.px - gesture.from) < Math.abs(best.px - gesture.from)
        ? point
        : best,
    undefined,
  );
}

function gestureLabel(
  gesture: Gesture,
  x: XDimension,
  measureName: string,
  kept: ChartPoint[],
  points: ChartPoint[],
): string {
  if (gesture.axis === "y") {
    const [low, high] = [
      Math.min(gesture.from, gesture.to),
      Math.max(gesture.from, gesture.to),
    ];
    return gesture.isRange
      ? `${measureName} ${formatNumber(low)} – ${formatNumber(high)}`
      : `${measureName} ${gesture.operator === ">=" ? "≥" : "≤"} ${formatNumber(gesture.from)}`;
  }
  if (gesture.isRange) {
    return kept.length > 0 ? formatRange(kept[0].x, kept.at(-1)!.x, x) : "";
  }
  const cut = cutPoint(gesture, points);
  return `${x.name} ${gesture.operator === ">=" ? "≥" : "≤"} ${cut ? formatX(cut.x, x) : ""}`;
}

type GestureTitleProps = {
  gesture: Gesture;
  x: XDimension;
  measureName: string;
  kept: ChartPoint[];
  points: ChartPoint[];
  onFlip: () => void;
};

/** The menu's heading; a line's operator is a toggle that flips ≥ and ≤. */
function GestureTitle({
  gesture,
  x,
  measureName,
  kept,
  points,
  onFlip,
}: GestureTitleProps) {
  if (gesture.isRange) {
    return <>{gestureLabel(gesture, x, measureName, kept, points)}</>;
  }
  const cut = cutPoint(gesture, points);
  const subject = gesture.axis === "y" ? measureName : x.name;
  const value =
    gesture.axis === "y"
      ? formatNumber(gesture.from)
      : cut
        ? formatX(cut.x, x)
        : "";
  return (
    <Group gap="xs" wrap="nowrap">
      <span>{subject}</span>
      <UnstyledButton
        onClick={onFlip}
        title={t`Flip`}
        px="xs"
        c="core-brand"
        fw="bold"
        style={{
          border: "1px solid var(--mb-color-core-brand)",
          borderRadius: 4,
        }}
      >
        {gesture.operator === ">=" ? "≥" : "≤"}
      </UnstyledButton>
      <span>{value}</span>
    </Group>
  );
}

type RangeActionsProps = {
  query: Lib.Query;
  x: XDimension;
  selected: unknown[];
  allValues: unknown[];
  onApply: ApplyQuery;
};

function RangeActions({
  query,
  x,
  selected,
  allValues,
  onApply,
}: RangeActionsProps) {
  const label = formatRange(selected[0], selected.at(-1), x);
  return (
    <>
      {x.kind !== "string" && (
        <Action onClick={() => onApply(zoomIn(query, x, selected, allValues))}>
          {t`Zoom in`}
        </Action>
      )}
      <Action onClick={() => onApply(onlyRange(query, x, selected, allValues))}>
        {t`Only ${label}`}
      </Action>
      <Action
        onClick={() => onApply(excludeRange(query, x, selected, allValues))}
      >
        {t`Exclude ${label}`}
      </Action>
    </>
  );
}

function menuAnchor(
  gesture: Gesture,
  kept: ChartPoint[],
  plot: ChartGeometry["plot"],
  band: number,
  yScale: YScale,
): Pick<MenuProps, "left" | "top" | "position"> {
  if (gesture.axis === "y") {
    return {
      left: plot.left + 8,
      top: yScale.pixelOf(Math.min(gesture.from, gesture.to)) + 4,
      position: "bottom-start",
    };
  }
  const edge = kept.length > 0 ? kept.at(-1)!.px + band / 2 : gesture.from;
  return { left: edge + 8, top: plot.top + 16, position: "right-start" };
}

type MenuProps = {
  left: number;
  top: number;
  position: "bottom-start" | "right-start";
  title: ReactNode;
  isDraggingRef: React.MutableRefObject<boolean>;
  onClose: () => void;
  children: ReactNode;
};

/** Today's click-actions menu, anchored where the gesture ended. */
function Menu({
  left,
  top,
  position,
  title,
  isDraggingRef,
  onClose,
  children,
}: MenuProps) {
  return (
    <Popover
      opened
      position={position}
      onChange={(isOpened) => {
        if (!isOpened && !isDraggingRef.current) {
          onClose();
        }
      }}
    >
      <Popover.Target>
        <Box pos="absolute" left={left} top={top} w={1} h={1} />
      </Popover.Target>
      <Popover.Dropdown className={S.lofi}>
        <MenuList>
          <Text size="sm" c="text-secondary" fw="normal" component="div">
            {title}
          </Text>
          {children}
        </MenuList>
      </Popover.Dropdown>
    </Popover>
  );
}

function YMarks({
  gesture,
  plot,
  yScale,
}: {
  gesture: Gesture;
  plot: ChartGeometry["plot"];
  yScale: YScale;
}) {
  const values = gesture.isRange ? [gesture.from, gesture.to] : [gesture.from];
  const [top, bottom] = [
    yScale.pixelOf(Math.max(gesture.from, gesture.to)),
    yScale.pixelOf(Math.min(gesture.from, gesture.to)),
  ];
  return (
    <>
      {gesture.isRange && (
        <Box
          pos="absolute"
          left={plot.left}
          top={top}
          w={plot.width}
          h={bottom - top}
          bg="core-brand"
          opacity={BAND_OPACITY}
          style={{ pointerEvents: "none", zIndex: 1 }}
        />
      )}
      {values.map((value, index) => (
        <Box key={index}>
          <YLine plot={plot} py={yScale.pixelOf(value)} />
          <ValuePill left={plot.left - 4} py={yScale.pixelOf(value)}>
            {formatNumber(value)}
          </ValuePill>
        </Box>
      ))}
    </>
  );
}

function XMarks({
  gesture,
  kept,
  plot,
  band,
}: {
  gesture: Gesture;
  kept: ChartPoint[];
  plot: ChartGeometry["plot"];
  band: number;
}) {
  const first = kept[0];
  const last = kept.at(-1)!;
  if (!gesture.isRange) {
    // The cut sits on the edge of the clicked slot that faces what's kept.
    const edge =
      gesture.operator === ">=" ? first.px - band / 2 : last.px + band / 2;
    return (
      <Box
        pos="absolute"
        left={edge}
        top={plot.top}
        h={plot.height + X_STRIP_HEIGHT}
        style={{
          borderLeft: "1px solid var(--mb-color-core-brand)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    );
  }
  return (
    <>
      <Box
        pos="absolute"
        left={first.px - band / 2}
        top={plot.top}
        w={last.px - first.px + band}
        h={plot.height + X_STRIP_HEIGHT}
        style={{
          borderLeft: "1px solid var(--mb-color-core-brand)",
          borderRight: "1px solid var(--mb-color-core-brand)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <Box
        pos="absolute"
        top={plot.top + plot.height + 4}
        h={X_STRIP_HEIGHT - 8}
        left={first.px - band / 2}
        w={last.px - first.px + band}
        style={{
          border: "1px solid var(--mb-color-core-brand)",
          borderRadius: 999,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </>
  );
}

function YLine({
  plot,
  py,
  isGhost = false,
}: {
  plot: ChartGeometry["plot"];
  py: number;
  isGhost?: boolean;
}) {
  return (
    <Box
      pos="absolute"
      left={plot.left}
      top={py}
      w={plot.width}
      style={{
        borderTop: `1px ${isGhost ? "dashed" : "solid"} var(--mb-color-core-brand)`,
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

function ValuePill({
  left,
  py,
  children,
}: {
  left: number;
  py: number;
  children: ReactNode;
}) {
  return (
    <Box
      pos="absolute"
      left={left}
      top={py}
      px="sm"
      bg="background_page-primary"
      c="core-brand"
      fz="xs"
      fw="bold"
      style={{
        transform: "translate(-100%, -50%)",
        border: "1px solid var(--mb-color-core-brand)",
        borderRadius: 999,
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {children}
    </Box>
  );
}

function DragTooltip({
  plot,
  children,
}: {
  plot: ChartGeometry["plot"];
  children: ReactNode;
}) {
  return (
    <Box
      pos="absolute"
      left={plot.left + plot.width - 8}
      top={plot.top + 8}
      bg="background_page-primary-inverse"
      c="text-primary-inverse"
      px="sm"
      py={4}
      fz="sm"
      style={{
        transform: "translateX(-100%)",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 3,
      }}
    >
      {children}
    </Box>
  );
}

/** Fades the slots that would be cut, so the chart previews the result. */
function Dims({
  points,
  kept,
  plot,
  band,
}: {
  points: ChartPoint[];
  kept: ChartPoint[];
  plot: ChartGeometry["plot"];
  band: number;
}) {
  return (
    <>
      {points
        .filter((point) => !kept.includes(point))
        .map((point) => (
          <Box
            key={point.px}
            pos="absolute"
            left={point.px - band / 2}
            top={plot.top}
            w={band}
            h={plot.height}
            bg="background_page-primary"
            opacity={DIM_OPACITY}
            style={{ pointerEvents: "none", zIndex: 1 }}
          />
        ))}
    </>
  );
}

function pointsInRange(
  points: ChartPoint[],
  fromPx: number,
  toPx: number,
  band: number,
): ChartPoint[] {
  const min = Math.min(fromPx, toPx) - band / 2;
  const max = Math.max(fromPx, toPx) + band / 2;
  return points.filter((point) => point.px > min && point.px < max);
}

function niceStep(raw: number): number {
  if (!isFinite(raw) || raw <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / power;
  const nice = ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10;
  return nice * power;
}

function sumY(points: ChartPoint[]): number {
  return points.reduce((sum, point) => sum + point.y, 0);
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
