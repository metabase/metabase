import { t } from "ttag";
import _ from "underscore";

import ObjectDetail from "metabase/visualizations/components/ObjectDetail";
import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";
import { formatColumn } from "metabase/lib/formatting";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";

const ObjectDetailProperties = {
  uiName: t`Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
  hidden: false,
  settings: {
    ...columnSettings({ hidden: true }),
    "detail.columns": {
      section: t`Columns`,
      title: t`Columns`,
      widget: ChartSettingOrderedColumns,
      getHidden: () => false,
      isValid: ([{ card, data }]) =>
        // If "detail.columns" happened to be an empty array,
        // it will be treated as "all columns are hidden",
        // This check ensures it's not empty,
        // otherwise it will be overwritten by `getDefault` below
        card.visualization_settings["detail.columns"].length !== 0 &&
        _.all(
          card.visualization_settings["detail.columns"],
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
          enabled: col.visibility_type !== "hidden",
        })),
      getProps: ([
        {
          data: { cols },
        },
      ]) => ({
        columns: cols,
      }),
    },
    "detail.showHeader": {
      section: t`Options`,
      title: t`Show Header`,
      widget: "toggle",
      default: false,
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
