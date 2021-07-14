import React, { Component } from "react";

import TableInteractive from "../components/TableInteractive.jsx";
import TableSimple from "../components/TableSimple";
import { t } from "ttag";
import * as DataGrid from "metabase/lib/data_grid";
import { findColumnIndexForColumnSetting } from "metabase/lib/dataset";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { getColumnCardinality } from "metabase/visualizations/lib/utils";
import { formatColumn } from "metabase/lib/formatting";

import * as Q_DEPRECATED from "metabase/lib/query";
import {
  isMetric,
  isDimension,
  isNumber,
  isURL,
  isEmail,
  isImageURL,
  isAvatarURL,
} from "metabase/lib/schema_metadata";

import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";
import ChartSettingsTableFormatting, {
  isFormattable,
} from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";

import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import _ from "underscore";
import cx from "classnames";

import { getIn } from "icepick";

import type { DatasetData } from "metabase-types/types/Dataset";
import type { VisualizationSettings } from "metabase-types/types/Card";
import type { Series } from "metabase-types/types/Visualization";
import type { SettingDefs } from "metabase/visualizations/lib/settings";

type Props = {
  series: Series,
  settings: VisualizationSettings,
  isDashboard: boolean,
};
type State = {
  data: ?DatasetData,
};

export default class Table extends Component {
  props: Props;
  state: State;

  static uiName = t`Table`;
  static identifier = "table";
  static iconName = "table";

  static minSize = { width: 4, height: 3 };

  static isSensible({ cols, rows }) {
    return true;
  }

  static isLiveResizable(series) {
    return false;
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    // scalar can always be rendered, nothing needed here
  }

  static settings: SettingDefs = {
    ...columnSettings({ hidden: true }),
    "table.pivot": {
      section: t`Columns`,
      title: t`Pivot the table`,
      widget: "toggle",
      getHidden: ([{ card, data }]) => data && data.cols.length !== 3,
      getDefault: ([{ card, data }]) =>
        data &&
        data.cols.length === 3 &&
        Q_DEPRECATED.isStructured(card.dataset_query) &&
        data.cols.filter(isMetric).length === 1 &&
        data.cols.filter(isDimension).length === 2,
    },
    "table.pivot_column": {
      section: t`Columns`,
      title: t`Pivot column`,
      widget: "field",
      getDefault: (
        [
          {
            data: { cols, rows },
          },
        ],
        settings,
      ) => {
        const col = _.min(cols.filter(isDimension), col =>
          getColumnCardinality(cols, rows, cols.indexOf(col)),
        );
        return col && col.name;
      },
      getProps: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => ({
        options: cols.filter(isDimension).map(getOptionFromColumn),
      }),
      getHidden: (series, settings) => !settings["table.pivot"],
      readDependencies: ["table.pivot"],
      persistDefault: true,
    },
    "table.cell_column": {
      section: t`Columns`,
      title: t`Cell column`,
      widget: "field",
      getDefault: ([{ data }], { "table.pivot_column": pivotCol }) => {
        // We try to show numeric values in pivot cells, but if none are
        // available, we fall back to the last column in the unpivoted table
        const nonPivotCols = data.cols.filter(c => c.name !== pivotCol);
        const lastCol = nonPivotCols[nonPivotCols.length - 1];
        const { name } = nonPivotCols.find(isMetric) || lastCol || {};
        return name;
      },
      getProps: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => ({
        options: cols.map(getOptionFromColumn),
      }),
      getHidden: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => !settings["table.pivot"],
      readDependencies: ["table.pivot", "table.pivot_column"],
      persistDefault: true,
    },
    // NOTE: table column settings may be identified by fieldRef (possible not normalized) or column name:
    //   { name: "COLUMN_NAME", enabled: true }
    //   { fieldRef: ["field", 2, {"source-field": 1}], enabled: true }
    "table.columns": {
      section: t`Columns`,
      title: t`Visible columns`,
      widget: ChartSettingOrderedColumns,
      getHidden: (series, vizSettings) => vizSettings["table.pivot"],
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
    "table.column_widths": {},
    "table.column_formatting": {
      section: t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      default: [],
      getProps: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => ({
        cols: cols.filter(isFormattable),
        isPivoted: settings["table.pivot"],
      }),
      getHidden: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => cols.filter(isFormattable).length === 0,
      readDependencies: ["table.pivot"],
    },
    "table._cell_background_getter": {
      getValue(
        [
          {
            data: { rows, cols },
          },
        ],
        settings,
      ) {
        return makeCellBackgroundGetter(rows, cols, settings);
      },
      readDependencies: ["table.column_formatting", "table.pivot"],
    },
  };

  static columnSettings = column => {
    const settings: SettingDefs = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: column => formatColumn(column),
      },
      click_behavior: {},
    };
    if (isNumber(column)) {
      settings["show_mini_bar"] = {
        title: t`Show a mini bar chart`,
        widget: "toggle",
      };
    }

    let defaultValue = !column.semantic_type || isURL(column) ? "link" : null;

    const options = [
      { name: t`Off`, value: null },
      { name: t`Link`, value: "link" },
    ];

    if (!column.semantic_type || isEmail(column)) {
      defaultValue = "email_link";
      options.push({ name: t`Email link`, value: "email_link" });
    }
    if (!column.semantic_type || isImageURL(column) || isAvatarURL(column)) {
      defaultValue = isAvatarURL(column) ? "image" : "link";
      options.push({ name: t`Image`, value: "image" });
    }
    if (!column.semantic_type) {
      defaultValue = "auto";
      options.push({ name: t`Automatic`, value: "auto" });
    }

    if (options.length > 1) {
      settings["view_as"] = {
        title: t`View as link or image`,
        widget: "select",
        default: defaultValue,
        props: {
          options,
        },
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: "input",
      hint: linkFieldsHint,
      default: null,
      getHidden: (_, settings) =>
        settings["view_as"] !== "link" && settings["view_as"] !== "email_link",
      readDependencies: ["view_as"],
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: "input",
      hint: linkFieldsHint,
      default: null,
      getHidden: (_, settings) => settings["view_as"] !== "link",
      readDependencies: ["view_as"],
    };

    return settings;
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      data: null,
    };
  }

  UNSAFE_componentWillMount() {
    this._updateData(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps: Props) {
    if (
      newProps.series !== this.props.series ||
      !_.isEqual(newProps.settings, this.props.settings)
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({
    series: [{ data }],
    settings,
  }: {
    series: Series,
    settings: VisualizationSettings,
  }) {
    if (settings["table.pivot"]) {
      const pivotIndex = _.findIndex(
        data.cols,
        col => col.name === settings["table.pivot_column"],
      );
      const cellIndex = _.findIndex(
        data.cols,
        col => col.name === settings["table.cell_column"],
      );
      const normalIndex = _.findIndex(
        data.cols,
        (col, index) => index !== pivotIndex && index !== cellIndex,
      );
      this.setState({
        data: DataGrid.pivot(
          data,
          normalIndex,
          pivotIndex,
          cellIndex,
          settings,
        ),
      });
    } else {
      const { cols, rows } = data;
      const columnSettings = settings["table.columns"];
      const columnIndexes = columnSettings
        .filter(columnSetting => columnSetting.enabled)
        .map(columnSetting =>
          findColumnIndexForColumnSetting(cols, columnSetting),
        )
        .filter(columnIndex => columnIndex >= 0 && columnIndex < cols.length);

      this.setState({
        data: {
          cols: columnIndexes.map(i => cols[i]),
          rows: rows.map(row => columnIndexes.map(i => row[i])),
        },
      });
    }
  }

  // shared helpers for table implementations

  getColumnTitle = (columnIndex: number): ?string => {
    const cols = this.state.data && this.state.data.cols;
    if (!cols) {
      return null;
    }
    const { settings } = this.props;
    const isPivoted = settings["table.pivot"];
    const column = cols[columnIndex];
    if (isPivoted) {
      return formatColumn(column) || (columnIndex !== 0 ? t`Unset` : null);
    } else {
      return (
        settings.column(column)["_column_title_full"] || formatColumn(column)
      );
    }
  };

  render() {
    const {
      series: [{ card }],
      isDashboard,
      settings,
    } = this.props;
    const { data } = this.state;
    const sort = getIn(card, ["dataset_query", "query", "order-by"]) || null;
    const isPivoted = settings["table.pivot"];
    const columnSettings = settings["table.columns"] || [];
    const areAllColumnsHidden = !columnSettings.some(f => f.enabled);
    const TableComponent = isDashboard ? TableSimple : TableInteractive;

    if (!data) {
      return null;
    }

    if (areAllColumnsHidden) {
      return (
        <div
          className={cx(
            "flex-full px1 pb1 text-centered flex flex-column layout-centered",
            { "text-slate-light": isDashboard, "text-slate": !isDashboard },
          )}
        >
          <img
            width={99}
            src="app/assets/img/hidden-field.png"
            srcSet="
              app/assets/img/hidden-field.png     1x,
              app/assets/img/hidden-field@2x.png  2x
            "
            className="mb2"
          />
          <span className="h4 text-bold">Every field is hidden right now</span>
        </div>
      );
    }

    return (
      <TableComponent
        {...this.props}
        data={data}
        isPivoted={isPivoted}
        sort={sort}
        getColumnTitle={this.getColumnTitle}
      />
    );
  }
}
