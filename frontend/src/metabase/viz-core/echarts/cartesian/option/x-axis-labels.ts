import { HORIZONTAL_TICKS_GAP } from "../constants/style";

const MAX_LABEL_CANDIDATES = 50;

type XAxisLabelOptions = {
  valuesCount: number;
  deduplicateLabels?: boolean;
  centerEndpoints?: boolean;
  getValue: (index: number) => number;
  getPosition: (value: number) => number;
  formatLabel: (value: number) => string;
  getLabelWidth: (text: string) => number;
  axisWidth: number;
  padding: number;
};

export function getXAxisLabelValues({
  valuesCount,
  deduplicateLabels = false,
  centerEndpoints = false,
  getValue,
  getPosition,
  formatLabel,
  getLabelWidth,
  axisWidth,
  padding,
}: XAxisLabelOptions): number[] | undefined {
  if (valuesCount < 2) {
    return undefined;
  }

  const labels = new Map<number, string>();
  const getLabel = (value: number) => {
    let label = labels.get(value);
    if (label === undefined) {
      label = formatLabel(value);
      labels.set(value, label);
    }
    return label;
  };
  const widths = new Map<string, number>();
  const measureLabel = (value: number) => {
    const label = getLabel(value);
    let width = widths.get(label);
    if (width === undefined) {
      width = getLabelWidth(label);
      widths.set(label, width);
    }
    return width;
  };

  const first = getValue(0);
  const last = getValue(valuesCount - 1);
  let previousLabelRight = centerEndpoints
    ? getPosition(first) + measureLabel(first) / 2
    : padding + measureLabel(first);
  const lastLabelLeft = centerEndpoints
    ? getPosition(last) - measureLabel(last) / 2
    : axisWidth - padding - measureLabel(last);
  if (
    !Number.isFinite(previousLabelRight) ||
    !Number.isFinite(lastLabelLeft) ||
    previousLabelRight + HORIZONTAL_TICKS_GAP > lastLabelLeft
  ) {
    return undefined;
  }

  const selected = [first];
  const selectedLabels = new Set([getLabel(first), getLabel(last)]);
  const sampleCount = Math.min(valuesCount, MAX_LABEL_CANDIDATES);
  for (let sample = 1; sample < sampleCount - 1; sample++) {
    const index = Math.round((sample * (valuesCount - 1)) / (sampleCount - 1));
    const value = getValue(index);
    const position = getPosition(value);
    if (
      !Number.isFinite(position) ||
      position <= previousLabelRight + HORIZONTAL_TICKS_GAP ||
      position >= lastLabelLeft - HORIZONTAL_TICKS_GAP
    ) {
      continue;
    }

    const label = getLabel(value);
    if (deduplicateLabels && selectedLabels.has(label)) {
      continue;
    }
    const halfWidth = measureLabel(value) / 2;
    if (
      position - halfWidth >= previousLabelRight + HORIZONTAL_TICKS_GAP &&
      position + halfWidth <= lastLabelLeft - HORIZONTAL_TICKS_GAP
    ) {
      selected.push(value);
      selectedLabels.add(label);
      previousLabelRight = position + halfWidth;
    }
  }
  selected.push(last);
  return selected;
}
