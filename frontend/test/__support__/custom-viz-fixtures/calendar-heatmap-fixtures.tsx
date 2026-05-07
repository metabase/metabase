import type {
  CustomVisualization,
  CustomVisualizationProps,
  ClickObject as CustomVizClickObject,
  HoverObject as CustomVizHoverObject,
} from "custom-viz";
import { useEffect, useRef, useState } from "react";
import { useUnmount } from "react-use";

import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { useColorScheme } from "metabase/ui";
import visualizations, { registerVisualization } from "metabase/visualizations";
import { getCustomPluginIdentifier } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type {
  Visualization,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { applyDefaultVisualizationProps } from "metabase-enterprise/custom_viz/custom-viz-common";
import { ensureVizApi } from "metabase-enterprise/custom_viz/custom-viz-globals";
import type { RowValues, VisualizationDisplay } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { factory as createHeatmapPlugin } from "../../../../enterprise/frontend/src/custom-viz/fixtures/calendar-heatmap/src";

export const PLUGIN_IDENTIFIER = "calendar-heatmap";
export const HEATMAP_DISPLAY = getCustomPluginIdentifier(
  PLUGIN_IDENTIFIER,
) as VisualizationDisplay;

export const HEATMAP_COLS = [
  createMockColumn(DateTimeColumn({ name: "date", display_name: "Date" })),
  createMockColumn(NumberColumn({ name: "value", display_name: "Value" })),
];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function buildYearData(year: number): RowValues[] {
  const rows: RowValues[] = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const days = isLeapYear(year) ? 366 : 365;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const value = Math.round(60 + 40 * Math.sin(i / 9) + 20 * Math.cos(i / 37));
    rows.push([iso, value]);
  }
  return rows;
}

export const HEATMAP_ROWS = buildYearData(2026);

/**
 * Milliseconds to wait between `useHeatmapPlugin()` flipping ready and
 * signalling Loki to snapshot. Covers ExplicitSize's first measurement and
 * the initial mount/update cycle.
 */
export const HEATMAP_SNAPSHOT_DELAY_MS = 200;

/**
 * Registers the calendar-heatmap fixture as a Metabase visualization on
 * first call and flips `ready` on the next tick.
 *
 * This bypasses `loadCustomVizPlugin` (and therefore the near-membrane
 * sandbox) entirely. The sandbox is the right contract for isolating
 * untrusted bundle bytes; it's the wrong contract for a Storybook fixture
 * we author and ship in this same repo.
 */
export function useHeatmapPlugin(): boolean {
  const [ready, setReady] = useState(() => {
    registerHeatmapPluginOnce();
    return false;
  });
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);
  return ready;
}

let registered = false;

function registerHeatmapPluginOnce() {
  if (registered) {
    return;
  }
  registered = true;
  ensureVizApi();

  const vizDef = createHeatmapPlugin({
    // The fixture has no settings, so defineSetting is never invoked —
    // identity is enough to satisfy the contract.
    defineSetting: ((d: unknown) => d) as never,
    getAssetUrl: (path) => path,
    locale: "en",
  }) as unknown as CustomVisualization<Record<string, unknown>>;

  const Wrapper = createMountWrapper(vizDef.mount);
  const Component = ExplicitSize<VisualizationProps>({ wrapped: true })(
    Wrapper,
  ) as Visualization;

  applyDefaultVisualizationProps(Component, vizDef, {
    identifier: HEATMAP_DISPLAY,
    getUiName: () => "Calendar heatmap",
    isDev: false,
  });

  if (visualizations.has(HEATMAP_DISPLAY)) {
    visualizations.set(HEATMAP_DISPLAY, Component);
  } else {
    registerVisualization(Component);
  }
}

type MountFn = CustomVisualization<Record<string, unknown>>["mount"];
type MountHandle = ReturnType<MountFn>;

function createMountWrapper(mount: MountFn) {
  return function MountWrapper({
    width,
    height,
    series,
    settings,
    onVisualizationClick,
    onHoverChange,
  }: VisualizationProps) {
    const { resolvedColorScheme } = useColorScheme();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const handleRef = useRef<MountHandle | null>(null);

    const pluginProps: CustomVisualizationProps<Record<string, unknown>> = {
      width,
      height,
      series: series as unknown as CustomVisualizationProps<
        Record<string, unknown>
      >["series"],
      settings: settings as unknown as CustomVisualizationProps<
        Record<string, unknown>
      >["settings"],
      colorScheme: resolvedColorScheme,
      onClick: onVisualizationClick as unknown as (
        clickObject: CustomVizClickObject<Record<string, unknown>> | null,
      ) => void,
      onHover: onHoverChange as unknown as (
        hoverObject?: CustomVizHoverObject | null,
      ) => void,
    };

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }
      if (!handleRef.current) {
        handleRef.current = mount(containerRef.current, pluginProps);
      } else {
        handleRef.current.update(pluginProps);
      }
    });

    useUnmount(() => {
      handleRef.current?.unmount();
      handleRef.current = null;
    });

    return (
      <div
        ref={containerRef}
        data-test-fixture="calendar-heatmap"
        style={{ width: "100%", height: "100%" }}
      />
    );
  };
}
