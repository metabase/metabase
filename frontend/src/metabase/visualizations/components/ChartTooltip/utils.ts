import type React from "react";
import { Fragment, createElement } from "react";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
  isAlreadyScaled,
}: {
  value?: unknown;
  column?: RemappingHydratedDatasetColumn | DatasetColumn | null;
  settings?: ComputedVisualizationSettings;
  isAlreadyScaled?: boolean;
}) => {
  const options: OptionsType = {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  };

  if (isAlreadyScaled) {
    options.scale = 1;
  }

  return formatValue(value, options) ?? NULL_DISPLAY_VALUE;
};

const MAX_TOOLTIP_LINES = 3;

/**
 * Converts newline characters in a string to <br /> elements,
 * capping at MAX_TOOLTIP_LINES with ellipsis for overflow.
 * Non-string values are returned as-is.
 */
export const renderWithLineBreaks = (
  value: React.ReactNode,
): React.ReactNode => {
  if (typeof value !== "string" || !value.includes("\n")) {
    return value;
  }

  const lines = value.split("\n");
  const truncated = lines.length > MAX_TOOLTIP_LINES;
  const visibleLines = truncated ? lines.slice(0, MAX_TOOLTIP_LINES) : lines;

  return createElement(
    Fragment,
    null,
    ...visibleLines.flatMap((line, i) =>
      i < visibleLines.length - 1
        ? [line, createElement("br", { key: i })]
        : truncated
          ? [line + "\u2026"]
          : [line],
    ),
  );
};
