/* eslint-disable react/prop-types */
import { Component } from "react";

import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";
import { getIn } from "icepick";
import * as DataGrid from "metabase/lib/data_grid";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { getColumnCardinality } from "metabase/visualizations/lib/utils";
import { formatColumn } from "metabase/lib/formatting";

import ChartSettingLinkUrlInput from "metabase/visualizations/components/settings/ChartSettingLinkUrlInput";
import ChartSettingsTableFormatting, {
  isFormattable,
} from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";

import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import {
  columnSettings,
  tableColumnSettings,
  getTitleForColumn,
  isPivoted as _isPivoted,
} from "metabase/visualizations/lib/settings/column";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import {
  isMetric,
  isDimension,
  isNumber,
  isURL,
  isEmail,
  isImageURL,
  isAvatarURL,
} from "metabase-lib/types/utils/isa";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";
import * as Q_DEPRECATED from "metabase-lib/queries/utils";

import TableSimple from "../components/TableSimple";
import TableInteractive from "../components/TableInteractive/TableInteractive.jsx";

export default class Table extends Component {
  static uiName = t`Table`;
  static identifier = "table";
  static iconName = "table";
  static canSavePng = false;

  static minSize = getMinSize(this.identifier);
  static defaultSize = getDefaultSize(this.identifier);

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

  static isPivoted = _isPivoted;

  static settings = {
    ...columnSettings({ hidden: true }),
    "table.pivot": {
      section: t`Columns`,
      title: t`Pivot table`,
      widget: "toggle",
      inline: true,
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
    ...tableColumnSettings,
    "table.column_widths": {},
    [DataGrid.COLUMN_FORMATTING_SETTING]: {
      section: t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      default: [],
      getProps: (series, settings) => ({
        cols: series[0].data.cols.filter(isFormattable),
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
        return makeCellBackgroundGetter(
          rows,
          cols,
          settings[DataGrid.COLUMN_FORMATTING_SETTING] ?? [],
          settings["table.pivot"],
        );
      },
      readDependencies: [DataGrid.COLUMN_FORMATTING_SETTING, "table.pivot"],
    },
  };

  static columnSettings = column => {
    const settings = {
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
        inline: true,
      };
    }

    let defaultValue = !column.semantic_type || isURL(column) ? "link" : null;

    const options = [
      { name: t`Text`, value: null },
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
        title: t`Display as`,
        widget: options.length === 2 ? "radio" : "select",
        default: defaultValue,
        props: {
          options,
        },
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      default: null,
      getHidden: (_, settings) =>
        settings["view_as"] !== "link" && settings["view_as"] !== "email_link",
      readDependencies: ["view_as"],
      getProps: (
        col,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map(column => column.name),
          placeholder: t`Link to {{bird_id}}`,
        };
      },
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      default: null,
      getHidden: (_, settings) => settings["view_as"] !== "link",
      readDependencies: ["view_as"],
      getProps: (
        col,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map(column => column.name),
          placeholder: t`http://toucan.example/{{bird_id}}`,
        };
      },
    };

    return settings;
  };

  constructor(props) {
    super(props);

    this.state = {
      data: null,
    };
  }

  UNSAFE_componentWillMount() {
    this._updateData(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (
      newProps.series !== this.props.series ||
      !_.isEqual(newProps.settings, this.props.settings)
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({ series, settings }) {
    const [{ data }] = series;

    if (Table.isPivoted(series, settings)) {
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
        .filter(
          columnSetting =>
            columnSetting.enabled || this.props.isShowingDetailsOnlyColumns,
        )
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

  getColumnTitle = columnIndex => {
    const cols = this.state.data && this.state.data.cols;
    if (!cols) {
      return null;
    }
    const { series, settings } = this.props;
    return getTitleForColumn(cols[columnIndex], series, settings);
  };

  render() {
    const { series, isDashboard, settings } = this.props;
    const { data } = this.state;
    const [{ card }] = series;
    const sort = getIn(card, ["dataset_query", "query", "order-by"]) || null;
    const isPivoted = Table.isPivoted(series, settings);
    const areAllColumnsHidden = data.cols.length === 0;
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
          <span className="h4 text-bold">{t`Every field is hidden right now`}</span>
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
