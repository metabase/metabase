// PROTOTYPE: registers the chosen typeface with the FontFace API, under the
// family name the app already asks for ("Lato", "JetBrains Mono").
//
// Why this works: faces added from JS take precedence over the CSS @font-face
// rules of the same family, so the whole app — including charts and canvas
// text measurement, which use the family name from settings, not the CSS
// variable — switches to the prototype font. Deleting the faces restores Lato.
//
// Weight mapping: the app's CSS asks for 400/500/600/700/900. For each of
// those we add a face that points at the variable file with
// `font-variation-settings: "wght" <mapped>`. Needs a browser that supports
// that descriptor (Chrome 149 and Safari do).

import { getWeightRange } from "./fonts";
import type { AppWeight, FontTuning, PrototypeFont } from "./types";
import { APP_WEIGHTS } from "./types";

const CSS_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const bufferCache = new Map<string, Promise<ArrayBuffer>>();

const COMMENT_START = [0x2f, 0x2a]; // "/*"
const COMMENT_END = [0x2a, 0x2f]; // "*/"

/**
 * The build's BannerPlugin prepends the license comment to every asset a JS
 * chunk references, font files included. Cut it off so the bytes parse.
 */
function stripBanner(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== COMMENT_START[0] || bytes[1] !== COMMENT_START[1]) {
    return buffer;
  }
  for (let i = 2; i < bytes.length - 1; i++) {
    if (bytes[i] === COMMENT_END[0] && bytes[i + 1] === COMMENT_END[1]) {
      let start = i + 2;
      while (bytes[start] === 0x0a || bytes[start] === 0x0d) {
        start++;
      }
      return buffer.slice(start);
    }
  }
  return buffer;
}

function loadBuffer(url: string): Promise<ArrayBuffer> {
  let buffer = bufferCache.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((response) => response.arrayBuffer())
      .then(stripBanner);
    bufferCache.set(url, buffer);
  }
  return buffer;
}

function isAppWeight(weight: number): weight is AppWeight {
  return APP_WEIGHTS.some((appWeight) => appWeight === weight);
}

/** What a CSS font-weight renders as, after the mapping in the panel. */
export function getMappedWeight(
  cssWeight: number,
  font: PrototypeFont,
  tuning: FontTuning,
): number {
  const { min, max } = getWeightRange(font);
  const clamp = (weight: number) => Math.min(max, Math.max(min, weight));
  const { weights } = tuning;

  if (isAppWeight(cssWeight)) {
    return clamp(weights[cssWeight]);
  }
  if (cssWeight === 800) {
    return clamp((weights[700] + weights[900]) / 2);
  }
  // 100–300: keep the same distance below Regular.
  return clamp(cssWeight + (weights[400] - 400));
}

function getVariationSettings(
  font: PrototypeFont,
  tuning: FontTuning,
  mappedWeight: number,
): string {
  const settings = [`"wght" ${mappedWeight}`];
  for (const axis of font.axes) {
    const value = tuning.axes[axis.tag];
    if (axis.tag !== "wght" && value !== undefined) {
      settings.push(`"${axis.tag}" ${value}`);
    }
  }
  return settings.join(", ");
}

// TypeScript's DOM lib doesn't list the metric override descriptors yet.
type MetricFontFaceDescriptors = FontFaceDescriptors & {
  sizeAdjust?: string;
  ascentOverride?: string;
  descentOverride?: string;
  lineGapOverride?: string;
};

function getMetricDescriptors(tuning: FontTuning): MetricFontFaceDescriptors {
  const pct = (value: number | undefined) =>
    value === undefined ? "normal" : `${value}%`;
  return {
    sizeAdjust: `${tuning.sizeAdjustPct}%`,
    ascentOverride: pct(tuning.ascentOverridePct),
    descentOverride: pct(tuning.descentOverridePct),
    lineGapOverride: pct(tuning.lineGapOverridePct),
    display: "block",
  };
}

async function buildFaces(
  family: string,
  font: PrototypeFont,
  tuning: FontTuning,
): Promise<FontFace[]> {
  const metrics = getMetricDescriptors(tuning);

  const faces = await Promise.all(
    CSS_WEIGHTS.map(async (cssWeight) => {
      const mappedWeight = getMappedWeight(cssWeight, font, tuning);

      if (font.kind === "static") {
        const nearest = font.staticWeights.reduce((best, candidate) =>
          Math.abs(candidate.weight - mappedWeight) <
          Math.abs(best.weight - mappedWeight)
            ? candidate
            : best,
        );
        return Promise.all(
          nearest.files.map(
            async (file) =>
              new FontFace(family, await loadBuffer(file.url), {
                ...metrics,
                weight: String(cssWeight),
                unicodeRange: file.unicodeRange,
              }),
          ),
        );
      }

      const variationSettings = getVariationSettings(
        font,
        tuning,
        mappedWeight,
      );
      return Promise.all(
        font.files.map(
          async (file) =>
            new FontFace(family, await loadBuffer(file.url), {
              ...metrics,
              weight: String(cssWeight),
              unicodeRange: file.unicodeRange,
              variationSettings,
            }),
        ),
      );
    }),
  );

  const flat = faces.flat();
  await Promise.all(flat.map((face) => face.load()));
  return flat;
}

/**
 * Keeps one set of faces registered for a family. Each `apply` replaces the
 * previous set once the new one has loaded, so dragging a slider doesn't flash
 * the fallback font. Stale applies that finish late are dropped.
 */
export function createFaceRegistry(family: string) {
  let current: FontFace[] = [];
  let generation = 0;

  const remove = () => {
    current.forEach((face) => document.fonts.delete(face));
    current = [];
  };

  return {
    async apply(font: PrototypeFont | undefined, tuning: FontTuning | null) {
      const thisGeneration = ++generation;
      if (!font || !tuning) {
        remove();
        return;
      }
      const faces = await buildFaces(family, font, tuning);
      if (thisGeneration !== generation) {
        return;
      }
      faces.forEach((face) => document.fonts.add(face));
      const previous = current;
      current = faces;
      previous.forEach((face) => document.fonts.delete(face));
    },
    clear() {
      generation++;
      remove();
    },
  };
}
