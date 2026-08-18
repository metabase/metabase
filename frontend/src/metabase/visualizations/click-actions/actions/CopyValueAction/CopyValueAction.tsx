import { t } from "ttag";

import { formatValue } from "metabase/visualizations/lib/formatting";
import type {
  ComputedVisualizationSettings,
  LegacyDrill,
} from "metabase/visualizations/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";

export const CopyValueAction: LegacyDrill = ({ clicked, settings }) => {
  const column = clicked?.column;

  if (!clicked || column == null || clicked.value == null) {
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
