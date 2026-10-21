import { RangeSlider, Slider } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting/numbers";
import type * as Lib from "metabase-lib";

import S from "./HistogramSlider.module.css";

interface HistogramSliderProps {
  operator: Lib.NumberFilterOperator;
  histogram: number[];
  min: number;
  max: number;
  isInteger: boolean;
  values: (number | null)[];
  onChange: (values: number[]) => void;
}

const TRACK_VARS = {
  "--slider-track-bg": "var(--mb-color-background_surface-secondary)",
};

/**
 * The slider covers the range of the data, from min to max. The filter values
 * come from the inputs too and can be out of this range: the slider shows them
 * at its nearest end, and changes them only when the user moves it.
 */
export function HistogramSlider({
  operator,
  histogram,
  min,
  max,
  isInteger,
  values,
  onChange,
}: HistogramSliderProps) {
  const step = getStep(min, max, isInteger);
  const clamp = (value: number) => Math.min(Math.max(value, min), max);
  const round = (value: number) => roundToStep(value, step);
  const bucketWidth = (max - min) / histogram.length;
  const isInverted = operator === ">" || operator === ">=";

  return (
    <div style={{ width: getHistogramWidth(histogram.length) }}>
      <HistogramBars
        histogram={histogram}
        isHighlighted={(index) =>
          isHighlighted(
            operator,
            values,
            min + bucketWidth * index,
            min + bucketWidth * (index + 1),
            index === histogram.length - 1,
          )
        }
      />
      <div
        className={S.slider}
        style={{ marginInline: BAR_WIDTH / 2 - SLIDER_SIZE }}
      >
        {operator === "between" ? (
          <RangeSlider
            min={min}
            max={max}
            step={step}
            size={SLIDER_SIZE}
            thumbSize={12}
            color="background_surface-brand-strong"
            __vars={TRACK_VARS}
            label={null}
            minRange={0}
            value={[clamp(values[0] ?? min), clamp(values[1] ?? max)]}
            onChange={([start, end]) => onChange([round(start), round(end)])}
          />
        ) : (
          <Slider
            min={min}
            max={max}
            step={step}
            size={SLIDER_SIZE}
            thumbSize={12}
            color="background_surface-brand-strong"
            __vars={TRACK_VARS}
            label={null}
            // The filled part of the track is the part that the filter keeps.
            inverted={isInverted}
            // Equal to keeps one value, not a range, so there is no fill.
            classNames={{
              bar:
                operator === "=" || operator === "!="
                  ? S.hiddenBar
                  : S.invertedBar,
            }}
            // With no value, the thumb is at the end where the fill is empty,
            // so that the slider and the histogram show nothing selected.
            value={clamp(values[0] ?? (isInverted ? max : min))}
            onChange={(value) => onChange([round(value)])}
          />
        )}
      </div>
      <div className={S.axis}>
        <span>{formatNumber(min, { maximumFractionDigits: 2 })}</span>
        <span>
          {formatNumber((min + max) / 2, { maximumFractionDigits: 2 })}
        </span>
        <span>{formatNumber(max, { maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

const HISTOGRAM_HEIGHT = 48;
const BAR_WIDTH = 4;
const BAR_GAP = 1;
// Mantine pads the slider by its size on each side, and the thumb center
// moves only inside this padding. The slider wrapper has negative margins, so
// that the thumb center is at the center of the first and the last bar at the
// ends of the range.
const SLIDER_SIZE = 6;
const BAR_RADIUS = 2;

/**
 * Width of the histogram in CSS pixels. The bars and the gaps have fixed whole
 * widths, so that all bars and all gaps look the same. A width that fits the
 * popover would give them fractional widths, and the browser would round them
 * to different widths.
 */
export function getHistogramWidth(bucketCount: number) {
  return bucketCount * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
}

interface HistogramBarsProps {
  histogram: number[];
  isHighlighted: (index: number) => boolean;
}

function HistogramBars({ histogram, isHighlighted }: HistogramBarsProps) {
  // Heights are in device pixels, so that the bar tops are sharp too. All the
  // edges are on whole pixels, so only the rounded corners are anti-aliased.
  const pixelRatio = window.devicePixelRatio || 1;
  const width = getHistogramWidth(histogram.length);
  const deviceHeight = Math.round(HISTOGRAM_HEIGHT * pixelRatio);
  const emptyHeight = Math.max(1, Math.round(pixelRatio));
  const maxCount = Math.max(...histogram, 1);

  return (
    <svg
      className={S.histogram}
      width={width}
      height={HISTOGRAM_HEIGHT}
      viewBox={`0 0 ${width * pixelRatio} ${deviceHeight}`}
    >
      {histogram.map((count, index) => {
        const barHeight =
          count > 0
            ? Math.max(
                Math.round((count / maxCount) * deviceHeight),
                emptyHeight * 2,
              )
            : emptyHeight;
        return (
          <rect
            key={index}
            className={S.bar}
            data-highlighted={isHighlighted(index)}
            x={index * (BAR_WIDTH + BAR_GAP) * pixelRatio}
            y={deviceHeight - barHeight}
            width={BAR_WIDTH * pixelRatio}
            height={barHeight}
            rx={
              barHeight >= 2 * BAR_RADIUS * pixelRatio
                ? BAR_RADIUS * pixelRatio
                : 0
            }
          />
        );
      })}
    </svg>
  );
}

function getStep(min: number, max: number, isInteger: boolean) {
  if (isInteger) {
    return 1;
  }
  const rawStep = (max - min) / 1000;
  return rawStep > 0 ? 10 ** Math.floor(Math.log10(rawStep)) : 1;
}

function roundToStep(value: number, step: number) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function isHighlighted(
  operator: Lib.NumberFilterOperator,
  values: (number | null)[],
  bucketStart: number,
  bucketEnd: number,
  isLastBucket: boolean,
) {
  const [value, secondValue] = values;
  if (operator === "between") {
    // Same as the slider: a missing end is the end of the data range. A
    // between filter with one value works like greater than or less than.
    const start = value ?? -Infinity;
    const end = secondValue ?? Infinity;
    return bucketEnd > start && bucketStart < end;
  }
  if (value == null) {
    return false;
  }
  const isValueInBucket =
    value >= bucketStart &&
    (value < bucketEnd || (isLastBucket && value === bucketEnd));
  switch (operator) {
    case "=":
      return isValueInBucket;
    case "!=":
      return !isValueInBucket;
    case ">":
    case ">=":
      return bucketEnd > value;
    case "<":
    case "<=":
      return bucketStart < value;
    default:
      return false;
  }
}
