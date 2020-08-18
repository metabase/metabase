/* @flow */

import { t } from "ttag";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

// NOTE: cyclical dependency
// import { showChartSettings } from "metabase/query_builder/actions";
function showChartSettings(...args) {
  return require("metabase/query_builder/actions").showChartSettings(...args);
}

import { keyForColumn } from "metabase/lib/dataset";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (!clicked || clicked.value !== undefined || !clicked.column) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "formatting",
      section: "formatting",
      title: t`Formatting`,
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
