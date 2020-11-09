import React, { Component } from "react";
import { t } from "ttag";

import { isDimension } from "metabase/lib/schema_metadata";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { multiLevelPivot } from "metabase/lib/data_grid";
// import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";

export default class PivotTable extends Component {
  props: VisualizationProps;
  static uiName = t`Pivot Table`;
  static identifier = "pivot";
  static iconName = "table";

  static isSensible({ cols }) {
    return (
      cols.every(
        col => col.source === "aggregation" || col.source === "breakout",
      ) && cols.filter(col => col.source === "breakout").length < 5
    );
  }

  static checkRenderable(foo) {
    // todo: raise when we can't render
  }

  static seriesAreCompatible(initialSeries, newSeries) {
    return false;
  }

  static settings = {
    ...columnSettings({ hidden: true }),
    "pivot_table.table_rows": {
      section: null,
      title: t`Fields to use for the table rows`,
      widget: "fields",
      getProps: ([{ data }], settings) => {
        if (!data) {
          return {};
        }
        return {
          options: data.cols.filter(isDimension).map(getOptionFromColumn),
          addAnother: t`Add a column`,
          columns: data.cols,
        };
      },
      getDefault: () => [null],
    },
    "pivot_table.table_columns": {
      section: null,
      title: t`Fields to use for the table columns`,
      widget: "fields",
      getProps: ([{ data }], settings) => {
        if (!data) {
          return {};
        }
        return {
          options: data.cols.filter(isDimension).map(getOptionFromColumn),
          addAnother: t`Add a column`,
          columns: data.cols,
        };
      },
      getDefault: () => [null],
    },
    "pivot_table.table_values": {
      section: null,
      title: t`Fields to use for the table values`,
      widget: "fields",
      getProps: ([{ data }], settings) => {
        if (!data) {
          return {};
        }
        return {
          options: data.cols.map(getOptionFromColumn),
          addAnother: t`Add a column`,
          columns: data.cols,
        };
      },
      getDefault: () => [null],
    },
  };

  componentDidMount() {
    this.element.setAttribute("border", "1");
  }
  componentDidUpdate() {
    this.element.setAttribute("border", "1");
  }

  render() {
    const { settings, data } = this.props;
    console.log({ settings, cols: data.cols });
    const [rowIndexes, columnIndexes, valueIndexes] = [
      "pivot_table.table_rows",
      "pivot_table.table_columns",
      "pivot_table.table_values",
    ].map(settingName =>
      settings[settingName]
        .map(colOption =>
          data.cols.findIndex(
            col => getOptionFromColumn(col).value === colOption,
          ),
        )
        .filter(index => index !== -1),
    );

    let pivoted;
    try {
      pivoted = multiLevelPivot(data, columnIndexes, rowIndexes, valueIndexes);
    } catch (e) {
      console.warn(e);
    }
    if (!pivoted) {
      return <div>no data - check for error</div>;
    }
    const { headerRows, bodyRows } = pivoted;

    return (
      <div className="overflow-scroll">
        <table ref={e => (this.element = e)}>
          <thead>
            {headerRows.map((row, rowIndex) => (
              <tr>
                {rowIndex === 0 &&
                  rowIndexes.map(index => (
                    <th rowSpan={headerRows.length}>
                      {data.cols[index].display_name}
                    </th>
                  ))}

                {row.map(({ value, span }) => (
                  <th colSpan={span}>{value}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {bodyRows.map(row => (
              <tr>
                {row.map(({ value, span }) => (
                  <td rowSpan={span}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
