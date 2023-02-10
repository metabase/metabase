import { t } from "ttag";
import _ from "underscore";

import ObjectDetail from "metabase/visualizations/components/ObjectDetail";

import ChartSettingColumnEditor from "metabase/visualizations/components/settings/ChartSettingColumnEditor";
import { ChartSettingOrderedSimple } from "metabase/visualizations/components/settings/ChartSettingOrderedSimple";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { formatColumn } from "metabase/lib/formatting";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import {
  findColumnIndexForColumnSetting,
  findColumnForColumnSetting,
} from "metabase-lib/queries/utils/dataset";

const ObjectDetailProperties = {
  uiName: t`Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
  hidden: false,
  disableClickBehavior: true,
  settings: {
    ...columnSettings({ hidden: true }),
    "detail.columns": {
      section: t`Columns`,
      title: t`Columns`,
      widget: ChartSettingOrderedSimple,
      getHidden: () => false,
      isValid: ([{ card, data }], _vizSettings, extra = {}) =>
        // If "detail.columns" happened to be an empty array,
        // it will be treated as "all columns are hidden",
        // This check ensures it's not empty,
        // otherwise it will be overwritten by `getDefault` below
        card.visualization_settings["detail.columns"].length !== 0 &&
        (extra.isQueryRunning ||
          _.all(
            card.visualization_settings["detail.columns"],
            columnSetting =>
              !columnSettings.enabled ||
              findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
          )),
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
        hasOnEnable: false,
        paddingLeft: "0",
        hideOnDisabled: true,
        getPopoverProps: columnSetting => ({
          id: "column_settings",
          props: {
            initialKey: getColumnKey(
              findColumnForColumnSetting(cols, columnSetting),
            ),
          },
        }),
        extraButton: {
          text: t`Add or remove columns`,
          key: "detail.columns_visibility",
        },
        getItemTitle: columnSetting =>
          getFriendlyName(
            findColumnForColumnSetting(cols, columnSetting) || {
              display_name: "[Unknown]",
            },
          ),
      }),
    },
    "detail.columns_visibility": {
      hidden: true,
      writeSettingId: "detail.columns",
      readDependencies: ["detail.columns"],
      widget: ChartSettingColumnEditor,
      getValue: (_series, vizSettings) => vizSettings["detail.columns"],
      getProps: (
        [
          {
            data: { cols },
          },
        ],
        _settings,
        _onChange,
        extra,
      ) => ({
        columns: cols,
        isDashboard: extra.isDashboard,
        metadata: extra.metadata,
        isQueryRunning: extra.isQueryRunning,
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
