/* @flow */

import React from "react";

import { registerVisualization } from "metabase/visualizations/index";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import Table from "metabase/visualizations/visualizations/Table";

import EmptyState from "metabase/components/EmptyState";

import NoResults from "assets/img/no_results.svg";

import { t } from "ttag";

import _ from "underscore";
import cx from "classnames";

export default class AuditTableVisualization extends React.Component {
  static identifier = "audit-table";
  static noHeader = true;
  static hidden = true;

  // copy Table's settings and columnSettings
  static settings = Table.settings;
  static columnSettings = Table.columnSettings;

  render() {
    const {
      series: [
        {
          data: { cols, rows },
        },
      ],
      visualizationIsClickable,
      onVisualizationClick,
      settings,
    } = this.props;

    const columnIndexes = settings["table.columns"]
      .filter(({ enabled }) => enabled)
      .map(({ name }) => _.findIndex(cols, col => col.name === name));

    if (rows.length === 0) {
      return (
        <EmptyState
          title={t`No results`}
          illustrationElement={<img src={NoResults} />}
        />
      );
    }

    return (
      <table className="ContentTable">
        <thead>
          <tr>
            {columnIndexes.map(colIndex => (
              <th
                className={cx({
                  "text-right": isColumnRightAligned(cols[colIndex]),
                })}
              >
                {formatColumn(cols[colIndex])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr>
              {columnIndexes.map(colIndex => {
                const value = row[colIndex];
                const column = cols[colIndex];
                const clicked = { column, value, origin: { row, cols } };
                const clickable = visualizationIsClickable(clicked);
                const columnSettings = settings.column(column);
                return (
                  <td
                    className={cx({
                      "text-brand cursor-pointer": clickable,
                      "text-right": isColumnRightAligned(column),
                    })}
                    onClick={
                      clickable ? () => onVisualizationClick(clicked) : null
                    }
                  >
                    {formatValue(value, {
                      ...columnSettings,
                      type: "cell",
                      jsx: true,
                      rich: true,
                      clicked: clicked,
                      // always show timestamps in local time for the audit app
                      local: true,
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}

registerVisualization(AuditTableVisualization);
