import React from "react";
import PropTypes from "prop-types";

import { registerVisualization } from "metabase/visualizations/index";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import Table from "metabase/visualizations/visualizations/Table";

import EmptyState from "metabase/components/EmptyState";
import Icon from "metabase/components/Icon";

import NoResults from "assets/img/no_results.svg";

import { t } from "ttag";

import _ from "underscore";
import cx from "classnames";

const getColumnName = column => column.remapped_to || column.name;

const propTypes = {
  series: PropTypes.array,
  visualizationIsClickable: PropTypes.func,
  onVisualizationClick: PropTypes.func,
  onSortingChange: PropTypes.func,
  settings: PropTypes.object,
  isSortable: PropTypes.bool,
  sorting: PropTypes.shape({
    column: PropTypes.string.isRequired,
    isAscending: PropTypes.bool.isRequired,
  }),
};

export default class AuditTableVisualization extends React.Component {
  static identifier = "audit-table";
  static noHeader = true;
  static hidden = true;

  // copy Table's settings and columnSettings
  static settings = Table.settings;
  static columnSettings = Table.columnSettings;

  handleColumnHeaderClick = column => {
    const { isSortable, onSortingChange, sorting } = this.props;

    if (!isSortable || !onSortingChange) {
      return;
    }

    const columnName = getColumnName(column);

    onSortingChange({
      column: columnName,
      isAscending: columnName !== sorting.column || !sorting.isAscending,
    });
  };

  render() {
    const {
      series: [
        {
          data: { cols, rows },
        },
      ],
      sorting,
      visualizationIsClickable,
      onVisualizationClick,
      settings,
      isSortable,
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
            {columnIndexes.map(colIndex => {
              const column = cols[colIndex];
              const isSortedByColumn =
                sorting && sorting.column === getColumnName(column);

              return (
                <th
                  key={colIndex}
                  onClick={() => this.handleColumnHeaderClick(column)}
                  className={cx("text-nowrap", {
                    "text-right": isColumnRightAligned(column),
                    "text-brand": isSortedByColumn,
                    "cursor-pointer text-brand-hover": isSortable,
                  })}
                >
                  {formatColumn(cols[colIndex])}
                  {isSortedByColumn && (
                    <Icon
                      className="ml1"
                      name={sorting.isAscending ? "chevronup" : "chevrondown"}
                      size={10}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columnIndexes.map(colIndex => {
                const value = row[colIndex];
                const column = cols[colIndex];
                const clicked = { column, value, origin: { row, cols } };
                const clickable = visualizationIsClickable(clicked);
                const columnSettings = settings.column(column);

                return (
                  <td
                    key={colIndex}
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

AuditTableVisualization.propTypes = propTypes;

registerVisualization(AuditTableVisualization);
