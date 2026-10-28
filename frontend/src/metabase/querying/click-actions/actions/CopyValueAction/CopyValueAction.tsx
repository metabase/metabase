import { t } from "ttag";

import { formatValue } from "metabase/value-formatting";
import type { LegacyDrill } from "metabase/visualizations/types";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import { nativeDrillFallback } from "../utils";

export const CopyValueAction: LegacyDrill = ({
  clicked,
  settings,
  question,
}) => {
  const column = clicked?.column;

  // "View details" is a PK cell's only action, and a lone default action skips the
  // popover — a second action here would break that jump to the object detail view.
  if (!clicked || column == null || clicked.value == null || isPK(column)) {
    return [];
  }
  // Clicks that group several rows (the pie "Other" slice carries array dimension
  // values) have no single cell value and only offer viewing the underlying records.
  if (clicked.dimensions?.some((dimension) => Array.isArray(dimension.value))) {
    return [];
  }
  // This action should not override the native query fallback
  if (nativeDrillFallback({ question })) {
    return [];
  }

  const computedSettings: ComputedVisualizationSettings | undefined = settings;
  const columnSettings =
    computedSettings?.column?.(column) ?? getColumnSettings(settings, column);

  const formattedValue = String(
    formatValue(clicked.value, {
      ...columnSettings,
      column,
      type: "cell",
      clicked,
    }),
  );

  return [
    {
      name: "copy-value",
      section: "copy",
      title: t`Copy value`,
      buttonType: "horizontal",
      icon: "copy",
      type: "custom",
      onClick: ({ closePopover }) => {
        navigator.clipboard.writeText(formattedValue);
        closePopover();
      },
    },
  ];
};
