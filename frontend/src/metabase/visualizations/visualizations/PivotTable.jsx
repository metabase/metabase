import React, { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { isDimension } from "metabase/lib/schema_metadata";
import { multiLevelPivot } from "metabase/lib/data_grid";
// import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const partitions = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: t`Fields to use for the table rows`,
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: t`Fields to use for the table columns`,
  },
  { name: "values", title: t`Fields to use for the table values` },
];
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
    "pivot_table.column_split": {
      section: null,
      widget: "fieldsPartition",
      getProps: ([{ data }], settings) => ({ partitions }),
      getValue: ([{ data }], settings = {}) => {
        const columns = data.cols;
        const storedValue = settings["pivot_table.column_split"];
        if (storedValue == null) {
          return {
            rows: columns.filter(isDimension),
            values: columns.filter(col => !isDimension(col)),
            columns: [],
          };
        }

        return updateValueWithCurrentColumns(storedValue, columns);
      },
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
    const {
      rows: rowIndexes,
      columns: columnIndexes,
      values: valueIndexes,
    } = _.mapObject(settings["pivot_table.column_split"], columns =>
      columns
        .map(column =>
          data.cols.findIndex(col =>
            _.isEqual(col.field_ref, column.field_ref),
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

function updateValueWithCurrentColumns(storedValue, columns) {
  const currentQueryFieldRefs = columns.map(c => JSON.stringify(c.field_ref));
  const currentSettingFieldRefs = Object.values(storedValue).flatMap(columns =>
    columns.map(c => JSON.stringify(c.field_ref)),
  );
  const toAdd = _.difference(currentQueryFieldRefs, currentSettingFieldRefs);
  const toRemove = _.difference(currentSettingFieldRefs, currentQueryFieldRefs);

  // remove toRemove
  const value = _.mapObject(storedValue, columns =>
    columns.filter(col => !toRemove.includes(JSON.stringify(col.field_ref))),
  );
  // add toAdd to first partitions where it matches the filter
  for (const fieldRef of toAdd) {
    for (const { filter, name } of partitions) {
      const column = columns.find(
        c => JSON.stringify(c.field_ref) === fieldRef,
      );
      if (filter == null || filter(column)) {
        value[name] = [...value[name], column];
        break;
      }
    }
  }
  return value;
}
