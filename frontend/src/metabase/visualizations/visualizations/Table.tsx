import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { formatColumn } from "metabase/lib/formatting";
import * as DataGrid from "metabase/lib/data_grid";

import ChartSettingLinkUrlInput from "metabase/visualizations/components/settings/ChartSettingLinkUrlInput";
import ChartSettingsTableFormatting, {
  isFormattable,
} from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";

import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import {
  columnSettings,
  buildTableColumnSettings,
  getTitleForColumn,
  isPivoted as _isPivoted,
} from "metabase/visualizations/lib/settings/column";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { getDefaultPivotColumn } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import type {
  DatasetColumn,
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
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

import type { ColumnSettingDefinition, VisualizationProps } from "../types";
import { TableSimple } from "../components/TableSimple";
import TableInteractive from "../components/TableInteractive/TableInteractive.jsx";

interface TableProps extends VisualizationProps {
  isShowingDetailsOnlyColumns?: boolean;
}

interface TableState {
  data: Pick<DatasetData, "cols" | "rows" | "results_timezone"> | null;
  question: Question | null;
}

class Table extends Component<TableProps, TableState> {
  static uiName = t`Table`;
  static identifier = "table";
  static iconName = "table";
  static canSavePng = false;

  static minSize = getMinSize("table");
  static defaultSize = getDefaultSize("table");

  static isSensible() {
    return true;
  }

  static isLiveResizable() {
    return false;
  }

  static checkRenderable() {
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
      getHidden: ([{ data }]: Series) => data && data.cols.length !== 3,
      getDefault: ([{ card, data }]: Series) => {
        if (
          !data ||
          data.cols.length !== 3 ||
          !Q_DEPRECATED.isStructured(card.dataset_query) ||
          data.cols.filter(isMetric).length !== 1 ||
          data.cols.filter(isDimension).length !== 2
        ) {
          return false;
        }

        return getDefaultPivotColumn(data.cols, data.rows) != null;
      },
    },
    "table.pivot_column": {
      section: t`Columns`,
      title: t`Pivot column`,
      widget: "field",
      getDefault: ([
        {
          data: { cols, rows },
        },
      ]: Series) => {
        return getDefaultPivotColumn(cols, rows)?.name;
      },
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        options: cols.filter(isDimension).map(getOptionFromColumn),
      }),
      getHidden: (series: Series, settings: VisualizationSettings) =>
        !settings["table.pivot"],
      readDependencies: ["table.pivot"],
      persistDefault: true,
    },
    "table.cell_column": {
      section: t`Columns`,
      title: t`Cell column`,
      widget: "field",
      getDefault: (
        [{ data }]: Series,
        { "table.pivot_column": pivotCol }: VisualizationSettings,
      ) => {
        // We try to show numeric values in pivot cells, but if none are
        // available, we fall back to the last column in the unpivoted table
        const nonPivotCols = data.cols.filter(c => c.name !== pivotCol);
        const lastCol = nonPivotCols[nonPivotCols.length - 1];
        const { name } = nonPivotCols.find(isMetric) || lastCol || {};
        return name;
      },
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        options: cols.map(getOptionFromColumn),
      }),
      getHidden: (series: Series, settings: VisualizationSettings) =>
        !settings["table.pivot"],
      readDependencies: ["table.pivot", "table.pivot_column"],
      persistDefault: true,
    },
    ...buildTableColumnSettings(),
    "table.column_widths": {},
    [DataGrid.COLUMN_FORMATTING_SETTING]: {
      section: t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      default: [],
      getProps: (series: Series, settings: VisualizationSettings) => ({
        cols: series[0].data.cols.filter(isFormattable),
        isPivoted: settings["table.pivot"],
      }),

      getHidden: ([
        {
          data: { cols },
        },
      ]: Series) => cols.filter(isFormattable).length === 0,
      readDependencies: ["table.pivot"],
    },
    "table._cell_background_getter": {
      getValue(
        [
          {
            data: { rows, cols },
          },
        ]: Series,
        settings: VisualizationSettings,
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

  static columnSettings = (column: DatasetColumn) => {
    const settings: Record<
      string,
      ColumnSettingDefinition<unknown, unknown>
    > = {
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
        column,
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
        column,
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

  state: TableState = {
    data: null,
    question: null,
  };

  UNSAFE_componentWillMount() {
    this._updateData(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps: VisualizationProps) {
    if (
      newProps.series !== this.props.series ||
      !_.isEqual(newProps.settings, this.props.settings)
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({ series, settings, metadata }: VisualizationProps) {
    const [{ card, data }] = series;

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
        data: DataGrid.pivot(data, normalIndex, pivotIndex, cellIndex),
      });
    } else {
      const { cols, rows, results_timezone } = data;
      const columnSettings = settings["table.columns"];
      const columnIndexes = (columnSettings || [])
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
          results_timezone,
        },

        // construct a Question that is in-sync with query results
        // cache it here for performance reasons
        question: new Question(card, metadata),
      });
    }
  }

  // shared helpers for table implementations

  getColumnTitle = (columnIndex: number) => {
    const cols = this.state.data && this.state.data.cols;
    if (!cols) {
      return null;
    }
    const { series, settings } = this.props;
    return getTitleForColumn(cols[columnIndex], series, settings);
  };

  getColumnSortDirection = (columnIndex: number) => {
    const { question, data } = this.state;
    if (!question || !data) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;
    const column = Lib.findMatchingColumn(
      query,
      stageIndex,
      Lib.fromLegacyColumn(query, stageIndex, data.cols[columnIndex]),
      Lib.orderableColumns(query, stageIndex),
    );

    if (column != null) {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);
      if (columnInfo.orderByPosition != null) {
        const orderBys = Lib.orderBys(query, stageIndex);
        const orderBy = orderBys[columnInfo.orderByPosition];
        const orderByInfo = Lib.displayInfo(query, stageIndex, orderBy);
        return orderByInfo.direction;
      }
    }
  };

  render() {
    const { series, isDashboard, settings } = this.props;
    const { data } = this.state;
    const isPivoted = Table.isPivoted(series, settings);
    const areAllColumnsHidden = data?.cols.length === 0;
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
        getColumnTitle={this.getColumnTitle}
        getColumnSortDirection={this.getColumnSortDirection}
      />
    );
  }
}

// eslint-disable-next-line import/no-default-export
export default Table;
