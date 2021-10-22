import { t } from "ttag";

import { keyForColumn } from "metabase/lib/dataset";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

function showChartSettings(...args) {
  return require("metabase/query_builder/actions").showChartSettings(...args);
}

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (!clicked || clicked.value !== undefined || !clicked.column) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "formatting",
      title: "Column formatting",
      section: "sort",
      buttonType: "formatting",
      icon: "gear",
      tooltip: t`Column formatting`,
      action: () =>
        showChartSettings({
          widget: {
            id: "column_settings",
            props: { initialKey: keyForColumn(column) },
          },
        }),
    },
  ];
};
