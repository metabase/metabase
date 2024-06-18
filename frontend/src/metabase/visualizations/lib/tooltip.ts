import { formatValue } from "metabase/lib/formatting";
import { formatNullable } from "metabase/lib/formatting/nullable";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { getFormattingOptionsWithoutScaling } from "../echarts/cartesian/model/util";

function getElementIndex(e: HTMLElement | null) {
  return (
    e &&
    [...e.classList]
      .map(c => c.match(/^_(\d+)$/))
      .filter(c => c)
      .map(c => (c != null ? parseInt(c[1], 10) : null))[0]
  );
}

function getParentWithClass(element: HTMLElement, className: string) {
  while (element) {
    if (element.classList && element.classList.contains(className)) {
      return element;
    }
    element = element.parentNode as HTMLElement;
  }
  return null;
}

// HACK: This determines the index of the series the provided element belongs to since DC doesn't seem to provide another way
export function determineSeriesIndexFromElement(
  element: HTMLElement,
  isStacked: boolean,
) {
  if (isStacked) {
    if (element.classList.contains("dot")) {
      // .dots are children of dc-tooltip
      return getElementIndex(getParentWithClass(element, "dc-tooltip"));
    } else {
      return getElementIndex(getParentWithClass(element, "stack"));
    }
  } else {
    return getElementIndex(getParentWithClass(element, "sub"));
  }
}

export const formatValueForTooltip = ({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: DatasetColumn;
  settings?: VisualizationSettings;
}) => {
  const nullableValue = formatNullable(value);

  // since we already transformed the dataset values, we do not need to
  // consider scaling anymore
  const options = getFormattingOptionsWithoutScaling({
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    weekday_enabled: true,
    type: "tooltip",
    majorWidth: 0,
  });
  return formatValue(nullableValue, options);
};
