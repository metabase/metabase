/* @flow */

import React, { Component } from "react";

import TableInteractive from "../components/TableInteractive.jsx";
import TableSimple from "../components/TableSimple.jsx";
import { t } from "c-3po";
import * as DataGrid from "metabase/lib/data_grid";

import Query from "metabase/lib/query";
import { isMetric, isDimension } from "metabase/lib/schema_metadata";
import {
  columnsAreValid,
  getFriendlyName,
} from "metabase/visualizations/lib/utils";
import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields.jsx";
import ChartSettingsTableFormatting from "metabase/visualizations/components/settings/ChartSettingsTableFormatting.jsx";

import _ from "underscore";
import cx from "classnames";
import d3 from "d3";
import Color from "color";

import RetinaImage from "react-retina-image";
import { getIn } from "icepick";

import type { DatasetData } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

type Props = {
  card: Card,
  data: DatasetData,
  settings: VisualizationSettings,
  isDashboard: boolean,
};
type State = {
  data: ?DatasetData,
};

function compileFormatter(format, data, isRowFormatter = false) {
  if (format.type === "single") {
    let { operator, value, color } = format;
    if (isRowFormatter) {
      color = Color(color)
        .fade(0.5)
        .string();
    }
    switch (operator) {
      case "<":
        return v => (v < value ? color : null);
      case "<=":
        return v => (v <= value ? color : null);
      case ">=":
        return v => (v >= value ? color : null);
      case ">":
        return v => (v > value ? color : null);
      case "=":
        return v => (v === value ? color : null);
      case "!=":
        return v => (v !== value ? color : null);
    }
  } else if (format.type === "range") {
    const extent = format.columns
      .map(colName => {
        const colIndex = _.findIndex(data.cols, col => col.name === colName);
        return d3.extent(data.rows, row => row[colIndex]);
      })
      .reduce(
        ([minA, maxA], [minB, maxB]) => [
          Math.min(minA, minB),
          Math.max(maxA, maxB),
        ],
        [Infinity, -Infinity],
      );
    if (format.min_type === "custom") {
      extent[0] = format.min_value;
    }
    if (format.max_type === "custom") {
      extent[1] = format.max_value;
    }
    return d3.scale
      .linear()
      .domain(extent)
      .range(format.colors)
      .clamp(true);
  } else {
    console.warn("Unknown format type", format.type);
    return () => null;
  }
}

function compileFormatters(formats, data) {
  const formatters = {};
  for (const format of formats) {
    const formatter = compileFormatter(format, data);
    for (const colName of format.columns) {
      formatters[colName] = formatters[colName] || [];
      formatters[colName].push(formatter);
    }
  }
  return formatters;
}

function compileRowFormatters(formats, data) {
  const rowFormatters = [];
  for (const format of formats.filter(
    format => format.type === "single" && format.highlight_row,
  )) {
    const formatter = compileFormatter(format, data, true);
    for (const colName of format.columns) {
      rowFormatters.push((row, colIndexes) =>
        formatter(row[colIndexes[colName]]),
      );
    }
  }
  return rowFormatters;
}

export default class Table extends Component {
  props: Props;
  state: State;

  static uiName = t`Table`;
  static identifier = "table";
  static iconName = "table";

  static minSize = { width: 4, height: 3 };

  static isSensible(cols, rows) {
    return true;
  }

  static checkRenderable([{ data: { cols, rows } }]) {
    // scalar can always be rendered, nothing needed here
  }

  static settings = {
    "table.pivot": {
      section: "Data",
      title: t`Pivot the table`,
      widget: "toggle",
      getHidden: ([{ card, data }]) => data && data.cols.length !== 3,
      getDefault: ([{ card, data }]) =>
        data &&
        data.cols.length === 3 &&
        Query.isStructured(card.dataset_query) &&
        data.cols.filter(isMetric).length === 1 &&
        data.cols.filter(isDimension).length === 2,
    },
    "table.columns": {
      section: "Data",
      title: t`Fields to include`,
      widget: ChartSettingOrderedFields,
      getHidden: (series, vizSettings) => vizSettings["table.pivot"],
      isValid: ([{ card, data }]) =>
        card.visualization_settings["table.columns"] &&
        columnsAreValid(
          card.visualization_settings["table.columns"].map(x => x.name),
          data,
        ),
      getDefault: ([{ data: { cols } }]) =>
        cols.map(col => ({
          name: col.name,
          enabled: col.visibility_type !== "details-only",
        })),
      getProps: ([{ data: { cols } }]) => ({
        columnNames: cols.reduce(
          (o, col) => ({ ...o, [col.name]: getFriendlyName(col) }),
          {},
        ),
      }),
    },
    "table.column_widths": {},
    "table.column_formatting": {
      section: "Formatting",
      widget: ChartSettingsTableFormatting,
      default: [],
      getProps: ([{ data: { cols } }]) => ({ cols }),
    },
    "table._cell_background_getter": {
      getValue([{ data }], settings) {
        const { rows, cols } = data;
        const formats = settings["table.column_formatting"];
        let formatters = {};
        let rowFormatters = [];
        try {
          formatters = compileFormatters(formats, data);
          rowFormatters = compileRowFormatters(formats, data);
        } catch (e) {
          console.error(e);
        }
        const colIndexes = _.object(
          cols.map((col, index) => [col.name, index]),
        );
        return function(rowIndex, colName) {
          if (formatters[colName]) {
            const value = rows[rowIndex][colIndexes[colName]];
            for (const formatter of formatters[colName]) {
              const color = formatter(value);
              if (color != null) {
                return color;
              }
            }
          }
          for (const rowFormatter of rowFormatters) {
            const color = rowFormatter(rows[rowIndex], colIndexes);
            if (color != null) {
              return color;
            }
          }
        };
      },
      readDependencies: ["table.column_formatting"],
    },
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      data: null,
    };
  }

  componentWillMount() {
    this._updateData(this.props);
  }

  componentWillReceiveProps(newProps: Props) {
    // TODO: remove use of deprecated "card" and "data" props
    if (
      newProps.data !== this.props.data ||
      !_.isEqual(newProps.settings, this.props.settings)
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({
    data,
    settings,
  }: {
    data: DatasetData,
    settings: VisualizationSettings,
  }) {
    if (settings["table.pivot"]) {
      this.setState({
        data: DataGrid.pivot(data),
      });
    } else {
      const { cols, rows, columns } = data;
      const columnIndexes = settings["table.columns"]
        .filter(f => f.enabled)
        .map(f => _.findIndex(cols, c => c.name === f.name))
        .filter(i => i >= 0 && i < cols.length);

      this.setState({
        data: {
          cols: columnIndexes.map(i => cols[i]),
          columns: columnIndexes.map(i => columns[i]),
          rows: rows.map(row => columnIndexes.map(i => row[i])),
        },
      });
    }
  }

  render() {
    const { card, isDashboard, settings } = this.props;
    const { data } = this.state;
    const sort = getIn(card, ["dataset_query", "query", "order_by"]) || null;
    const isPivoted = settings["table.pivot"];
    const isColumnsDisabled =
      (settings["table.columns"] || []).filter(f => f.enabled).length < 1;
    const TableComponent = isDashboard ? TableSimple : TableInteractive;

    if (!data) {
      return null;
    }

    if (isColumnsDisabled) {
      return (
        <div
          className={cx(
            "flex-full px1 pb1 text-centered flex flex-column layout-centered",
            { "text-slate-light": isDashboard, "text-slate": !isDashboard },
          )}
        >
          <RetinaImage
            width={99}
            src="app/assets/img/hidden-field.png"
            forceOriginalDimensions={false}
            className="mb2"
          />
          <span className="h4 text-bold">Every field is hidden right now</span>
        </div>
      );
    } else {
      return (
        // $FlowFixMe
        <TableComponent
          {...this.props}
          data={data}
          isPivoted={isPivoted}
          sort={sort}
          getCellBackgroundColor={settings["table._cell_background_getter"]}
        />
      );
    }
  }
}

/**
 * A modified version of TestPopover for Jest/Enzyme tests.
 * It always uses TableSimple which Enzyme is able to render correctly.
 * TableInteractive uses react-virtualized library which requires a real browser viewport.
 */
export const TestTable = (props: Props) => (
  <Table {...props} isDashboard={true} />
);
TestTable.uiName = Table.uiName;
TestTable.identifier = Table.identifier;
TestTable.iconName = Table.iconName;
TestTable.minSize = Table.minSize;
TestTable.settings = Table.settings;
