/* eslint-disable react/prop-types */
import { t } from "ttag";

// NOTE: cyclical dependency
// import { showChartSettings } from "metabase/query_builder/actions";
function showChartSettings(...args) {
  return require("metabase/query_builder/actions").showChartSettings(...args);
}

import { keyForColumn } from "metabase/lib/dataset";

export default ({ question, clicked }) => {
  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.column ||
    !question.query().isEditable()
  ) {
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
