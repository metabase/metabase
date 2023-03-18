import { t } from "ttag";
import _ from "underscore";

import ObjectDetail from "metabase/visualizations/components/ObjectDetail";
import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";

import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { formatColumn } from "metabase/lib/formatting";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";

const ObjectDetailProperties = {
  uiName: t`Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
  hidden: false,
  canSavePng: false,
  disableClickBehavior: true,
  settings: {
    ...columnSettings({ hidden: true }),
    "table.columns": {
      section: t`Columns`,
      title: t`Columns`,
      widget: ChartSettingOrderedColumns,
      getHidden: (_series, vizSettings) => vizSettings["table.pivot"],
      isValid: ([{ card, data }]) =>
        // If "table.columns" happened to be an empty array,
        // it will be treated as "all columns are hidden",
        // This check ensures it's not empty,
        // otherwise it will be overwritten by `getDefault` below
        card.visualization_settings["table.columns"].length !== 0 &&
        _.all(
          card.visualization_settings["table.columns"],
          columnSetting =>
            findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
        ),
      getDefault: ([
        {
          data: { cols },
        },
      ]) =>
        cols.map(col => ({
          name: col.name,
          fieldRef: col.field_ref,
          enabled: col.visibility_type !== "details-only",
        })),
      getProps: ([
        {
          data: { cols },
        },
      ]) => ({
        columns: cols,
      }),
    },
  },

  columnSettings: column => {
    const settings = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: column => formatColumn(column),
      },
      click_behavior: {},
    };

    return settings;
  },
  isSensible: () => true,
};

export default Object.assign(ObjectDetail, ObjectDetailProperties);
