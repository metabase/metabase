// PROTOTYPE: a Leva panel for trying other typefaces in the whole app.
//
// - Typeface: the UI font, the heading font and the code font. "Show Lato" (⌥L) flips back to
//   the app as shipped, for A/B comparison. ⌥P hides the panel.
// - Per typeface (remembered per font): size adjust, letter spacing, vertical
//   metrics, the weight each CSS weight renders as, variable axes, OpenType
//   features.
// - Global: the Mantine type scale and font smoothing.
//
// See font-faces.ts for how the font replaces Lato everywhere.

import { Leva, button, useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";

import { FontTuningControls } from "./FontTuningControls";
import { createFaceRegistry } from "./font-faces";
import {
  AUTO_HEADING_ID,
  CURRENT_FONT_ID,
  HEADING_FAMILY,
  MONOSPACE_FAMILY,
  MONOSPACE_FONTS,
  UI_FAMILY,
  UI_FONTS,
  findFont,
  getDefaultTuning,
  getFontLabel,
  readFontTuning,
  resolveHeadingFont,
} from "./fonts";
import { readStoredRecord, writeStoredRecord } from "./storage";
import type { FontTuning } from "./types";

const GLOBAL_STORAGE_KEY = "global";

/** Mantine's defaults, from metabase/ui/theme.ts, and the body size from GlobalStyles. */
const TYPE_SCALE_KEYS = [
  "body",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "h1",
  "h2",
  "h3",
  "h4",
] as const;
type TypeScaleKey = (typeof TYPE_SCALE_KEYS)[number];
const TYPE_SCALE_DEFAULTS: Record<TypeScaleKey, number> = {
  body: 14,
  xs: 11,
  sm: 12,
  md: 14,
  lg: 17,
  xl: 21,
  h1: 32,
  h2: 24,
  h3: 20,
  h4: 17,
};

const SMOOTHING_OPTIONS = {
  "Antialiased (current)": "antialiased",
  "Subpixel / auto": "auto",
};

function storedString(value: unknown, allowed: string[], fallback: string) {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}

function storedNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTypeScaleValues(
  values: Record<string, unknown>,
): Record<TypeScaleKey, number> {
  const get = (key: TypeScaleKey) =>
    storedNumber(values[key], TYPE_SCALE_DEFAULTS[key]);
  return {
    body: get("body"),
    xs: get("xs"),
    sm: get("sm"),
    md: get("md"),
    lg: get("lg"),
    xl: get("xl"),
    h1: get("h1"),
    h2: get("h2"),
    h3: get("h3"),
    h4: get("h4"),
  };
}

type GlobalCssOptions = {
  typeScale: Record<TypeScaleKey, number>;
  smoothing: string;
  tuning: FontTuning | null;
  hasHeadingFont: boolean;
};

function buildGlobalCss({
  typeScale,
  smoothing,
  tuning,
  hasHeadingFont,
}: GlobalCssOptions) {
  const headings = (["h1", "h2", "h3", "h4"] as const)
    .map((h) => `--mantine-${h}-font-size: ${typeScale[h]}px;`)
    .join("\n");
  const sizes = (["xs", "sm", "md", "lg", "xl"] as const)
    .map((size) => `--mantine-font-size-${size}: ${typeScale[size]}px;`)
    .join("\n");

  const everyElement = [
    tuning && tuning.letterSpacingEm !== 0
      ? `letter-spacing: ${tuning.letterSpacingEm}em;`
      : "",
    tuning && tuning.featureSettings
      ? `font-feature-settings: ${tuning.featureSettings};`
      : "",
  ].join("\n");

  // Mantine's Title and raw h1–h6. Text styled to look like a heading
  // (e.g. <Text fw="bold" fz="lg">) keeps the UI font.
  const headingFamily = `"${HEADING_FAMILY}", var(--mb-default-font-family)`;
  const headingRules = hasHeadingFont
    ? `h1, h2, h3, h4, h5, h6 { font-family: ${headingFamily}; }`
    : "";

  return `
    :root:root {
      ${sizes}
      ${headings}
      ${hasHeadingFont ? `--mantine-font-family-headings: ${headingFamily};` : ""}
    }
    ${headingRules}
    body {
      font-size: ${typeScale.body}px;
      -webkit-font-smoothing: ${smoothing};
      -moz-osx-font-smoothing: ${smoothing === "auto" ? "auto" : "grayscale"};
    }
    ${everyElement.trim() ? `* { ${everyElement} }` : ""}
  `;
}

/** A stylesheet the prototype owns. Constructed sheets aren't blocked by the app's CSP. */
function useAdoptedStyleSheet(): CSSStyleSheet {
  const [sheet] = useState(() => new CSSStyleSheet());
  useEffect(() => {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (adopted) => adopted !== sheet,
      );
    };
  }, [sheet]);
  return sheet;
}

export function FontPrototype() {
  const stored = useMemo(() => readStoredRecord(GLOBAL_STORAGE_KEY), []);
  const [fontTuning, setFontTuning] = useState<{
    fontId: string;
    tuning: FontTuning;
  } | null>(null);
  const [isPanelHidden, setIsPanelHidden] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(stored.collapsed === true);

  const uiFontIds = [CURRENT_FONT_ID, ...UI_FONTS.map((font) => font.id)];
  const monoFontIds = [CURRENT_FONT_ID, ...MONOSPACE_FONTS.map((f) => f.id)];
  const headingFontIds = [AUTO_HEADING_ID, ...UI_FONTS.map((font) => font.id)];

  const [typeface, setTypeface] = useControls(
    "Typeface",
    () => ({
      font: {
        label: "UI font",
        value: storedString(stored.font, uiFontIds, CURRENT_FONT_ID),
        options: {
          "Lato · as shipped": CURRENT_FONT_ID,
          ...Object.fromEntries(
            UI_FONTS.map((font) => [getFontLabel(font), font.id]),
          ),
        },
      },
      heading: {
        label: "Heading font",
        value: storedString(stored.heading, headingFontIds, AUTO_HEADING_ID),
        options: {
          "Auto (UI font or its pair)": AUTO_HEADING_ID,
          ...Object.fromEntries(UI_FONTS.map((font) => [font.family, font.id])),
        },
      },
      compare: { label: "Show Lato (⌥L)", value: false },
      monospace: {
        label: "Code font",
        value: storedString(stored.monospace, monoFontIds, CURRENT_FONT_ID),
        options: {
          "JetBrains Mono · as shipped": CURRENT_FONT_ID,
          ...Object.fromEntries(
            MONOSPACE_FONTS.map((font) => [getFontLabel(font), font.id]),
          ),
        },
      },
    }),
    { order: 0 },
  );

  const [typeScale, setTypeScale] = useControls(
    "Type scale (px)",
    () =>
      Object.fromEntries(
        TYPE_SCALE_KEYS.map((key) => [
          key,
          {
            label: key === "body" ? "body" : `Mantine ${key}`,
            value: storedNumber(
              stored[`scale_${key}`],
              TYPE_SCALE_DEFAULTS[key],
            ),
            min: 8,
            max: 48,
            step: 0.5,
          },
        ]),
      ),
    { order: 5, collapsed: true },
  );

  const rendering = useControls(
    "Rendering",
    {
      smoothing: {
        label: "Smoothing",
        value: storedString(
          stored.smoothing,
          Object.values(SMOOTHING_OPTIONS),
          "antialiased",
        ),
        options: SMOOTHING_OPTIONS,
      },
    },
    { order: 6, collapsed: true },
  );

  const typeScaleValues = getTypeScaleValues(typeScale);

  const uiFont = findFont(typeface.font);
  const monoFont = findFont(typeface.monospace);
  const headingFont = resolveHeadingFont(typeface.heading, uiFont);
  const isActive = !typeface.compare;
  const uiTuning =
    uiFont && fontTuning?.fontId === uiFont.id ? fontTuning.tuning : null;

  const setTypeScaleRef = useRef(setTypeScale);
  setTypeScaleRef.current = setTypeScale;

  // Everything "Copy settings" needs, read at click time.
  const snapshotRef = useRef<Record<string, unknown>>({});
  snapshotRef.current = {
    font: uiFont?.family ?? "Lato (as shipped)",
    headingFont: headingFont?.family ?? "same as UI font",
    monospace: monoFont?.family ?? "JetBrains Mono (as shipped)",
    tuning: uiTuning,
    typeScale: typeScaleValues,
    smoothing: rendering.smoothing,
  };

  useControls(
    "Actions",
    {
      "Copy settings as JSON": button(() => {
        navigator.clipboard.writeText(
          JSON.stringify(snapshotRef.current, null, 2),
        );
      }),
      "Reset type scale": button(() => {
        setTypeScaleRef.current(TYPE_SCALE_DEFAULTS);
      }),
    },
    { order: 7 },
  );

  // Persist the global settings.
  useEffect(() => {
    writeStoredRecord(GLOBAL_STORAGE_KEY, {
      font: typeface.font,
      monospace: typeface.monospace,
      heading: typeface.heading,
      smoothing: rendering.smoothing,
      collapsed: isCollapsed,
      ...Object.fromEntries(
        TYPE_SCALE_KEYS.map((key) => [`scale_${key}`, typeScaleValues[key]]),
      ),
    });
  });

  // ⌥L flips to Lato and back, ⌥P hides the panel.
  const compareRef = useRef(typeface.compare);
  compareRef.current = typeface.compare;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }
      if (event.code === "KeyL") {
        event.preventDefault();
        setTypeface({ compare: !compareRef.current });
      } else if (event.code === "KeyP") {
        event.preventDefault();
        setIsPanelHidden((hidden) => !hidden);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setTypeface]);

  // Register the faces.
  const uiRegistry = useMemo(() => createFaceRegistry(UI_FAMILY), []);
  const monoRegistry = useMemo(() => createFaceRegistry(MONOSPACE_FAMILY), []);
  const headingRegistry = useMemo(() => createFaceRegistry(HEADING_FAMILY), []);
  useEffect(() => {
    uiRegistry.apply(isActive ? uiFont : undefined, uiTuning);
  }, [uiRegistry, isActive, uiFont, uiTuning]);
  useEffect(() => {
    monoRegistry.apply(
      isActive ? monoFont : undefined,
      monoFont ? getDefaultTuning(monoFont) : null,
    );
  }, [monoRegistry, isActive, monoFont]);
  // The heading font uses the weights, axes and size it was last tuned to as
  // the UI font. Re-read when the UI font changes, since that's when it's saved.
  useEffect(() => {
    headingRegistry.apply(
      isActive ? headingFont : undefined,
      headingFont ? readFontTuning(headingFont) : null,
    );
  }, [headingRegistry, isActive, headingFont, uiFont]);
  useEffect(
    () => () => {
      uiRegistry.clear();
      monoRegistry.clear();
      headingRegistry.clear();
    },
    [uiRegistry, monoRegistry, headingRegistry],
  );

  // Sizes, smoothing, letter spacing and features.
  const sheet = useAdoptedStyleSheet();
  const css = isActive
    ? buildGlobalCss({
        typeScale: typeScaleValues,
        smoothing: rendering.smoothing,
        tuning: uiTuning,
        hasHeadingFont: headingFont !== undefined,
      })
    : "";
  useEffect(() => {
    sheet.replaceSync(css);
  }, [sheet, css]);

  return (
    <>
      <Leva
        hidden={isPanelHidden}
        collapsed={{ collapsed: isCollapsed, onChange: setIsCollapsed }}
        titleBar={{ title: "Fonts · ⌥P hides", filter: false }}
        theme={{ sizes: { rootWidth: "400px", controlWidth: "210px" } }}
      />
      {uiFont && (
        <FontTuningControls
          key={uiFont.id}
          font={uiFont}
          onChange={(tuning) => setFontTuning({ fontId: uiFont.id, tuning })}
        />
      )}
    </>
  );
}
