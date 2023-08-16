import { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { registerVisualization } from "metabase/visualizations/index";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import Table from "metabase/visualizations/visualizations/Table";

import EmptyState from "metabase/components/EmptyState";
import { Icon } from "metabase/core/components/Icon";
import CheckBox from "metabase/core/components/CheckBox";
import NoResults from "assets/img/no_results.svg";
import { getRowValuesByColumns, getColumnName } from "../../lib/mode";
import {
  HeaderCell,
  RemoveRowButton,
  RowCell,
} from "./AuditTableVisualization.styled";

const propTypes = {
  series: PropTypes.array,
  visualizationIsClickable: PropTypes.func,
  onVisualizationClick: PropTypes.func,
  onSortingChange: PropTypes.func,
  onRemoveRow: PropTypes.func,
  settings: PropTypes.object,
  isSortable: PropTypes.bool,
  sorting: PropTypes.shape({
    column: PropTypes.string.isRequired,
    isAscending: PropTypes.bool.isRequired,
  }),
  isSelectable: PropTypes.bool,
  rowChecked: PropTypes.object,
  onAllSelectClick: PropTypes.func,
  onRowSelectClick: PropTypes.func,
};

const ROW_ID_IDX = 0;

export class AuditTableVisualization extends Component {
  static identifier = "audit-table";
  static noHeader = true;
  static hidden = true;

  // copy Table's settings and columnSettings
  static settings = Table.settings;
  static columnSettings = Table.columnSettings;

  state = {
    rerender: {},
  };

  constructor(props) {
    super(props);
  }

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

  handleAllSelectClick = (e, rows) => {
    const { onAllSelectClick } = this.props;
    this.setState({ rerender: {} });
    onAllSelectClick({ ...e, rows });
  };

  handleRowSelectClick = (e, row, rowIndex) => {
    const { onRowSelectClick } = this.props;
    this.setState({ rerender: {} });
    onRowSelectClick({ ...e, row: row, rowIndex: rowIndex });
  };

  handleRemoveRowClick = (row, cols) => {
    const rowData = getRowValuesByColumns(row, cols);
    this.props.onRemoveRow(rowData);
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
      isSelectable,
      rowChecked,
      onRemoveRow,
    } = this.props;

    const canRemoveRows = !!onRemoveRow;
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
            {isSelectable && (
              <th>
                <CheckBox
                  checked={Object.values(rowChecked).some(elem => elem)}
                  onChange={e => this.handleAllSelectClick(e, rows)}
                />
              </th>
            )}
            {columnIndexes.map(colIndex => {
              const column = cols[colIndex];
              const isSortedByColumn =
                sorting && sorting.column === getColumnName(column);

              return (
                <HeaderCell
                  key={colIndex}
                  isSortable={isSortable}
                  isSortedByColumn={isSortedByColumn}
                  isRightAligned={isColumnRightAligned(column)}
                  onClick={() => this.handleColumnHeaderClick(column)}
                >
                  {formatColumn(cols[colIndex])}
                  {isSortedByColumn && (
                    <Icon
                      className="ml1"
                      name={sorting.isAscending ? "chevronup" : "chevrondown"}
                      size={10}
                    />
                  )}
                </HeaderCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {isSelectable && (
                <td>
                  <CheckBox
                    checked={rowChecked[row[ROW_ID_IDX]] || false}
                    onChange={e =>
                      this.handleRowSelectClick(
                        { ...e, originRow: rowIndex },
                        row,
                        rowIndex,
                      )
                    }
                  />
                </td>
              )}

              {columnIndexes.map(colIndex => {
                const value = row[colIndex];
                const column = cols[colIndex];
                const clicked = { column, value, origin: { row, cols } };
                const clickable = visualizationIsClickable(clicked);
                const columnSettings = {
                  ...settings.column(column),
                  ...settings["table.columns"][colIndex],
                };

                return (
                  <RowCell
                    key={colIndex}
                    isClickable={clickable}
                    isRightAligned={isColumnRightAligned(column)}
                    onClick={
                      clickable ? () => onVisualizationClick(clicked) : null
                    }
                  >
                    <div
                      className={cx({
                        "rounded p1 text-dark text-monospace text-small bg-light":
                          column["code"],
                      })}
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
                    </div>
                  </RowCell>
                );
              })}

              {canRemoveRows && (
                <td>
                  <RemoveRowButton
                    onClick={() => this.handleRemoveRowClick(row, cols)}
                  >
                    <Icon name="close" color="text-light" />
                  </RemoveRowButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}

AuditTableVisualization.propTypes = propTypes;

registerVisualization(AuditTableVisualization);
