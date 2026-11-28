// PROTOTYPE: chart colors playground. A Leva panel that lists the colors of
// the charts on screen in HSL and lets you change them live.
//
// - Colors: one folder per color, with a swatch (editable as text or with the
//   picker) and Hue / Saturation / Lightness sliders.
// - Batch edit: offsets added to every color at once, on top of its own values.
// - ⌥L: show as shipped (removes every override). ⌥P: hide the panel.
// - "Copy changes as JSON": only the colors that differ from shipped.

import { Leva, button, levaStore, useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type ChartColor,
  type Hsl,
  setColorOverrides,
  toHex,
  toHsl,
  useChartColors,
} from "./chart-colors";
import { readStoredRecord, storedNumber, writeStoredRecord } from "./storage";

const PANEL_TITLE = "Chart colors";
const COLORS_STORAGE_KEY = "colors";
const BATCH_STORAGE_KEY = "batch";

const BATCH_FOLDER = "Batch edit";
const COLORS_FOLDER = "Colors";
const MAX_HUE = 359;
// The Colors folder sits at Leva's default order (0): an order given to a
// nested folder only sorts it inside its parent. The others are placed around it.
const GENERAL_ORDER = -2;
const BATCH_ORDER = -1;
const ACTIONS_ORDER = 1;

type Batch = { enabled: boolean; h: number; s: number; l: number };

const colorFolder = (hex: string) => `${COLORS_FOLDER}.${hex}`;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const isSameHsl = (a: Hsl, b: Hsl) => a.h === b.h && a.s === b.s && a.l === b.l;

const toHslString = ({ h, s, l }: Hsl) => `hsl(${h}, ${s}%, ${l}%)`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storedHsl(value: unknown, fallback: Hsl): Hsl {
  return isRecord(value)
    ? {
        h: storedNumber(value.h, fallback.h),
        s: storedNumber(value.s, fallback.s),
        l: storedNumber(value.l, fallback.l),
      }
    : fallback;
}

/** The color drawn for `base` once the batch offsets are added. */
function withBatch(base: Hsl, batch: Batch): Hsl {
  if (!batch.enabled) {
    return base;
  }
  return {
    h: (((base.h + batch.h) % 360) + 360) % 360,
    s: clampPercent(base.s + batch.s),
    l: clampPercent(base.l + batch.l),
  };
}

type LevaData = ReturnType<typeof levaStore.getData>;

function readValue(data: LevaData, path: string): unknown {
  const input = data[path];
  return input && "value" in input ? input.value : undefined;
}

/** A color's own H/S/L sliders, or `undefined` before its folder has mounted. */
function readColor(data: LevaData, hex: string): Hsl | undefined {
  const folder = colorFolder(hex);
  const h = readValue(data, `${folder}.h`);
  const s = readValue(data, `${folder}.s`);
  const l = readValue(data, `${folder}.l`);
  return typeof h === "number" && typeof s === "number" && typeof l === "number"
    ? { h, s, l }
    : undefined;
}

function setColor(hex: string, hsl: Hsl) {
  const folder = colorFolder(hex);
  levaStore.set(
    {
      [`${folder}.h`]: hsl.h,
      [`${folder}.s`]: hsl.s,
      [`${folder}.l`]: hsl.l,
      [`${folder}.color`]: toHslString(hsl),
    },
    false,
  );
}

function setBatchOffsets(hsl: Hsl) {
  levaStore.set(
    {
      [`${BATCH_FOLDER}.batchHue`]: hsl.h,
      [`${BATCH_FOLDER}.batchSaturation`]: hsl.s,
      [`${BATCH_FOLDER}.batchLightness`]: hsl.l,
    },
    false,
  );
}

type ColorControlsProps = {
  color: ChartColor;
  initial: Hsl;
};

function ColorControls({ color, initial }: ColorControlsProps) {
  const usedBy = color.usedBy.join(", ");

  const [values, set] = useControls(
    colorFolder(color.hex),
    () => ({
      color: { label: usedBy, value: toHslString(initial) },
      h: { label: "Hue", value: initial.h, min: 0, max: MAX_HUE, step: 1 },
      s: { label: "Saturation", value: initial.s, min: 0, max: 100, step: 1 },
      l: { label: "Lightness", value: initial.l, min: 0, max: 100, step: 1 },
    }),
    {},
    [usedBy],
  );

  // Keeps the swatch and the sliders in step, whichever one moved.
  const { color: text, h, s, l } = values;
  const lastSliders = useRef<Hsl>({ h, s, l });
  useEffect(() => {
    const sliders = { h, s, l };
    const didSlidersMove = !isSameHsl(sliders, lastSliders.current);
    lastSliders.current = sliders;
    // Compared as drawn colors: at 0% or 100% lightness every hue is the same
    // color, and the sliders must keep theirs.
    const isInStep = toHex(toHsl(text)) === toHex(sliders);

    if (didSlidersMove) {
      set({ color: toHslString(sliders) });
    } else if (!isInStep) {
      set(toHsl(text));
    }
  }, [text, h, s, l, set]);

  return null;
}

export function ChartColorsPlayground() {
  const chartColors = useChartColors();
  const storedColors = useRef(readStoredRecord(COLORS_STORAGE_KEY));
  const storedBatch = useMemo(() => readStoredRecord(BATCH_STORAGE_KEY), []);
  const [isPanelHidden, setIsPanelHidden] = useState(false);

  const [{ showShipped }, setGeneral] = useControls(
    "General",
    () => ({
      showShipped: { label: "Show as shipped (⌥L)", value: false },
    }),
    { order: GENERAL_ORDER },
  );

  const isBatchMode = (get: (path: string) => unknown) =>
    get(`${BATCH_FOLDER}.batchEnabled`) === true;

  const batchValues = useControls(
    BATCH_FOLDER,
    {
      batchEnabled: {
        label: "Batch mode",
        value: storedBatch.enabled === true,
      },
      batchHue: {
        label: "Hue ±",
        value: storedNumber(storedBatch.h, 0),
        min: -180,
        max: 180,
        step: 1,
        render: isBatchMode,
      },
      batchSaturation: {
        label: "Saturation ±",
        value: storedNumber(storedBatch.s, 0),
        min: -100,
        max: 100,
        step: 1,
        render: isBatchMode,
      },
      batchLightness: {
        label: "Lightness ±",
        value: storedNumber(storedBatch.l, 0),
        min: -100,
        max: 100,
        step: 1,
        render: isBatchMode,
      },
      "Apply offsets to each color": button(() => {
        for (const { hex } of chartColorsRef.current) {
          const base = readColor(levaStore.getData(), hex);
          if (base) {
            setColor(hex, withBatch(base, batchRef.current));
          }
        }
        setBatchOffsets({ h: 0, s: 0, l: 0 });
      }),
    },
    { order: BATCH_ORDER },
  );

  const batch: Batch = useMemo(
    () => ({
      enabled: batchValues.batchEnabled,
      h: batchValues.batchHue,
      s: batchValues.batchSaturation,
      l: batchValues.batchLightness,
    }),
    [
      batchValues.batchEnabled,
      batchValues.batchHue,
      batchValues.batchSaturation,
      batchValues.batchLightness,
    ],
  );

  // Buttons capture their closure once, so they read the current values here.
  const chartColorsRef = useRef(chartColors);
  chartColorsRef.current = chartColors;
  const batchRef = useRef(batch);
  batchRef.current = batch;

  // Leva changes its data in place, so subscribe to the values themselves.
  const ownValuesJson = levaStore.useStore((state) =>
    JSON.stringify(
      chartColorsRef.current.map(({ hex }) => readColor(state.data, hex)),
    ),
  );

  const colors = useMemo(
    () =>
      chartColors.map((chartColor) => {
        const shipped = toHsl(chartColor.hex);
        const own = readColor(levaStore.getData(), chartColor.hex) ?? shipped;
        return { ...chartColor, shipped, own, drawn: withBatch(own, batch) };
      }),
    // ownValuesJson stands for the Leva values read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartColors, ownValuesJson, batch],
  );
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const changedJson = JSON.stringify(
    showShipped
      ? []
      : colors
          .filter(({ shipped, drawn }) => !isSameHsl(shipped, drawn))
          .map(({ hex, drawn }) => [hex, drawn]),
  );
  useEffect(() => {
    const overrides = new Map<string, Hsl>();
    for (const { hex, shipped, drawn } of colorsRef.current) {
      if (!isSameHsl(shipped, drawn)) {
        overrides.set(hex, drawn);
      }
    }
    setColorOverrides(showShipped ? new Map() : overrides);
  }, [changedJson, showShipped]);

  useEffect(() => () => setColorOverrides(new Map()), []);

  // Persist on every change. Colors of charts that aren't on screen stay stored.
  const ownJson = JSON.stringify(colors.map(({ hex, own }) => [hex, own]));
  useEffect(() => {
    const next = { ...storedColors.current };
    for (const { hex, own, shipped } of colorsRef.current) {
      if (isSameHsl(own, shipped)) {
        delete next[hex];
      } else {
        next[hex] = own;
      }
    }
    storedColors.current = next;
    writeStoredRecord(COLORS_STORAGE_KEY, next);
  }, [ownJson]);

  useEffect(() => {
    writeStoredRecord(BATCH_STORAGE_KEY, batch);
  }, [batch]);

  useControls(
    "Actions",
    {
      "Copy changes as JSON": button(() => {
        const changed = colorsRef.current
          .filter(({ shipped, drawn }) => !isSameHsl(shipped, drawn))
          .map(({ hex, usedBy, shipped, drawn }) => ({
            usedBy,
            shipped: { hex, hsl: toHslString(shipped) },
            value: { hex: toHex(drawn), hsl: toHslString(drawn) },
          }));
        navigator.clipboard.writeText(JSON.stringify(changed, null, 2));
      }),
      "Reset to shipped": button(() => {
        storedColors.current = {};
        for (const { hex, shipped } of colorsRef.current) {
          setColor(hex, shipped);
        }
        setBatchOffsets({ h: 0, s: 0, l: 0 });
      }),
    },
    { order: ACTIONS_ORDER },
  );

  // ⌥L shows the app as shipped, ⌥P hides the panel.
  const showShippedRef = useRef(showShipped);
  showShippedRef.current = showShipped;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }
      if (event.code === "KeyL") {
        event.preventDefault();
        setGeneral({ showShipped: !showShippedRef.current });
      } else if (event.code === "KeyP") {
        event.preventDefault();
        setIsPanelHidden((hidden) => !hidden);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setGeneral]);

  return (
    <>
      {chartColors.map((chartColor) => (
        <ColorControls
          key={chartColor.hex}
          color={chartColor}
          initial={storedHsl(
            storedColors.current[chartColor.hex],
            toHsl(chartColor.hex),
          )}
        />
      ))}
      <Leva
        hidden={isPanelHidden}
        titleBar={{ title: `${PANEL_TITLE} · ⌥P hides`, filter: false }}
        theme={{ sizes: { rootWidth: "360px", controlWidth: "200px" } }}
      />
    </>
  );
}
