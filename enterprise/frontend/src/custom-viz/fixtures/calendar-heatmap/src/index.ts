/**
 * Calendar Heatmap fixture plugin.
 *
 * Vanilla DOM/SVG (no React, no echarts) so the rendering stays small and
 * deterministic for Loki snapshots.
 *
 * The fixture is imported and registered directly by the Storybook fixture
 * helper (`frontend/test/__support__/custom-viz-fixtures/calendar-heatmap-fixtures.tsx`).
 * It does NOT go through `loadCustomVizPlugin` — that path runs the bundle
 * inside `@locker/near-membrane-dom`, which is geared toward isolating
 * untrusted plugin bytes and isn't the contract we want to exercise from a
 * Storybook iframe.
 */
// `custom-viz` is the tsconfig path alias pointing to the local package
// source. The runtime import in `calendar-heatmap-fixtures.tsx` reaches us
// via a relative path, but for type-only references we use the alias so
// the file works under the main tsconfig.
import type {
  CreateCustomVisualization,
  CustomVisualizationProps,
} from "custom-viz";

type Settings = Record<string, never>;
type Props = CustomVisualizationProps<Settings>;

const SVG_NS = "http://www.w3.org/2000/svg";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
// Heatmap palette for the fixture. Hand-picked blues approximating the
// look of GitHub's contribution graph; not part of the Metabase design
// system, so the design-system color rule doesn't apply here.
/* eslint-disable metabase/no-color-literals */
const PALETTE_LIGHT = ["#dde8f5", "#abc9eb", "#7caee0", "#4d92d4", "#2671c2"];
const PALETTE_DARK = ["#1f3a5f", "#2c5083", "#3866a8", "#4d92d4", "#7cb1e8"];
/* eslint-enable metabase/no-color-literals */

const CELL_SIZE = 14;
const CELL_GAP = 3;
const ROW_LABEL_WIDTH = 28;
const MONTH_LABEL_HEIGHT = 18;
const HEADER_HEIGHT = 32;
const LEGEND_HEIGHT = 22;

export const factory: CreateCustomVisualization<Settings> = () => ({
  id: "calendar-heatmap",
  getName: () => "Calendar heatmap",
  minSize: { width: 4, height: 4 },
  defaultSize: { width: 12, height: 6 },
  settings: {} as Record<keyof Settings, never>,
  checkRenderable(series) {
    if (!series?.[0]?.data) {
      throw new Error("Calendar heatmap requires a data series");
    }
  },
  // VisualizationComponent is required by the type but unused at runtime
  // (static viz support was removed in PR #73637). Pass a stub.
  VisualizationComponent: (() => null) as never,
  mount(container, initial) {
    let state = initial;
    const root = document.createElement("div");
    root.style.cssText =
      "width:100%;height:100%;display:flex;flex-direction:column;font-family:inherit;color:var(--mb-color-text-primary);";
    container.appendChild(root);

    const render = () => paint(root, state);
    render();

    return {
      update(next) {
        state = next;
        render();
      },
      unmount() {
        if (root.parentNode === container) {
          container.removeChild(root);
        }
      },
    };
  },
});

function paint(root: HTMLElement, props: Props) {
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }

  const palette = props.colorScheme === "dark" ? PALETTE_DARK : PALETTE_LIGHT;

  const rows = (props.series?.[0]?.data?.rows ?? []) as Array<[string, number]>;
  const days = parseDays(rows);
  const year = days[0]?.date.getUTCFullYear() ?? new Date().getUTCFullYear();
  const valueExtent = extent(days.map((d) => d.value));
  const bucketize = makeBucketize(valueExtent, palette.length);

  root.appendChild(buildHeader(year));
  root.appendChild(buildGrid(days, bucketize, palette));
  root.appendChild(buildLegend(palette));
}

function buildHeader(year: number): HTMLElement {
  const header = document.createElement("div");
  header.style.cssText = `display:flex;align-items:center;justify-content:center;gap:12px;height:${HEADER_HEIGHT}px;font-size:13px;`;

  header.appendChild(makeYearButton("Previous"));
  const label = document.createElement("strong");
  label.textContent = String(year);
  header.appendChild(label);
  header.appendChild(makeYearButton("Next"));
  return header;
}

function makeYearButton(text: string): HTMLElement {
  const btn = document.createElement("span");
  btn.textContent = text;
  btn.style.cssText =
    "padding:2px 10px;border:1px solid var(--mb-color-border);border-radius:6px;color:var(--mb-color-text-secondary);font-size:12px;";
  return btn;
}

function buildGrid(
  days: ParsedDay[],
  bucket: (value: number) => number,
  palette: string[],
): SVGSVGElement {
  // GitHub-style layout: each column is one ISO week, each row a day-of-week.
  const weeks = groupByWeek(days);
  const width = ROW_LABEL_WIDTH + weeks.length * (CELL_SIZE + CELL_GAP);
  const height = MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP) + CELL_GAP;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.cssText = "display:block;margin:0 auto;";

  // Day labels (left column).
  for (let d = 0; d < 7; d++) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "0");
    text.setAttribute(
      "y",
      String(
        MONTH_LABEL_HEIGHT + d * (CELL_SIZE + CELL_GAP) + CELL_SIZE * 0.75,
      ),
    );
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "var(--mb-color-text-secondary)");
    text.textContent = DAYS[d];
    svg.appendChild(text);
  }

  // Month labels: one per first column where the month changes.
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstOfWeek = weeks[w][0];
    if (!firstOfWeek) {
      continue;
    }
    const month = firstOfWeek.date.getUTCMonth();
    if (month === lastMonth) {
      continue;
    }
    lastMonth = month;
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute(
      "x",
      String(ROW_LABEL_WIDTH + w * (CELL_SIZE + CELL_GAP)),
    );
    text.setAttribute("y", String(MONTH_LABEL_HEIGHT - 6));
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "var(--mb-color-text-secondary)");
    text.textContent = MONTHS[month];
    svg.appendChild(text);
  }

  // Cells.
  for (let w = 0; w < weeks.length; w++) {
    for (const day of weeks[w]) {
      const dow = day.date.getUTCDay();
      const x = ROW_LABEL_WIDTH + w * (CELL_SIZE + CELL_GAP);
      const y = MONTH_LABEL_HEIGHT + dow * (CELL_SIZE + CELL_GAP);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(CELL_SIZE));
      rect.setAttribute("height", String(CELL_SIZE));
      rect.setAttribute("rx", "2");
      rect.setAttribute("ry", "2");
      rect.setAttribute("fill", palette[bucket(day.value)]);
      svg.appendChild(rect);
    }
  }

  return svg;
}

function buildLegend(palette: string[]): HTMLElement {
  const legend = document.createElement("div");
  legend.style.cssText = `display:flex;align-items:center;justify-content:center;gap:6px;height:${LEGEND_HEIGHT}px;font-size:11px;color:var(--mb-color-text-secondary);`;

  const less = document.createElement("span");
  less.textContent = "Less";
  legend.appendChild(less);

  for (const color of palette) {
    const dot = document.createElement("span");
    dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:5px;background:${color};`;
    legend.appendChild(dot);
  }

  const more = document.createElement("span");
  more.textContent = "More";
  legend.appendChild(more);

  return legend;
}

type ParsedDay = { date: Date; value: number };

function parseDays(rows: Array<[string, number]>): ParsedDay[] {
  return rows
    .map(([iso, value]) => ({ date: parseUTCDate(iso), value: Number(value) }))
    .filter((d) => !Number.isNaN(d.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function parseUTCDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function groupByWeek(days: ParsedDay[]): ParsedDay[][] {
  if (days.length === 0) {
    return [];
  }
  const weeks: ParsedDay[][] = [];
  let current: ParsedDay[] = [];
  let cursorWeek = -1;
  const start = days[0].date;
  for (const day of days) {
    const week = isoWeekIndex(day.date, start);
    if (week !== cursorWeek && current.length > 0) {
      weeks.push(current);
      current = [];
    }
    current.push(day);
    cursorWeek = week;
  }
  if (current.length > 0) {
    weeks.push(current);
  }
  return weeks;
}

function isoWeekIndex(date: Date, anchor: Date): number {
  const ms = date.getTime() - anchor.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 7));
}

function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) {
      continue;
    }
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }
  return [min, max];
}

function makeBucketize(
  [min, max]: [number, number],
  buckets: number,
): (value: number) => number {
  if (max === min) {
    return () => 0;
  }
  const step = (max - min) / buckets;
  return (value) => {
    if (Number.isNaN(value)) {
      return 0;
    }
    const idx = Math.floor((value - min) / step);
    return Math.max(0, Math.min(buckets - 1, idx));
  };
}
