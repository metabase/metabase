import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { getSubpathSafeUrl } from "metabase/urls";
import * as DataGrid from "metabase/visualizations/lib/data_grid";
import {
  isPivoted as _isPivoted,
  getTitleForColumn,
} from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData } from "metabase-types/api";

import { TableInteractive } from "../../components/TableInteractive";
import type { VisualizationProps } from "../../types";

import { TABLE_DEFINITION } from "./definition";

interface TableProps extends VisualizationProps {
  isShowingDetailsOnlyColumns?: boolean;
}

interface TableState {
  data: Pick<
    DatasetData,
    "cols" | "rows" | "results_timezone" | "rows_truncated"
  > | null;
  question: Question | null;
}

class TableComponent extends Component<TableProps, TableState> {
  state: TableState = {
    data: null,
    question: null,
  };

  UNSAFE_componentWillMount() {
    this._updateData(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps: TableProps) {
    if (
      newProps.series !== this.props.series ||
      !_.isEqual(newProps.settings, this.props.settings) ||
      newProps.isShowingDetailsOnlyColumns !==
        this.props.isShowingDetailsOnlyColumns
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({
    series,
    settings,
    metadata,
    isShowingDetailsOnlyColumns,
  }: TableProps) {
    const [{ card, data }] = series;
    // construct a Question that is in-sync with query results
    const question = new Question(card, metadata);

    if (_isPivoted(series, settings)) {
      const pivotIndex = _.findIndex(
        data.cols,
        (col) => col.name === settings["table.pivot_column"],
      );
      const cellIndex = _.findIndex(
        data.cols,
        (col) => col.name === settings["table.cell_column"],
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
        question,
      });
    } else {
      const { cols, rows, results_timezone, rows_truncated } = data;
      const columnSettings = settings["table.columns"] ?? [];
      const columnIndexes = findColumnIndexesForColumnSettings(
        cols,
        columnSettings,
      ).filter(
        (columnIndex, settingIndex) =>
          columnIndex >= 0 &&
          (isShowingDetailsOnlyColumns ||
            (cols[columnIndex].visibility_type !== "details-only" &&
              columnSettings[settingIndex].enabled)),
      );

      this.setState({
        data: {
          cols: columnIndexes.map((i) => cols[i]),
          rows: rows.map((row) => columnIndexes.map((i) => row[i])),
          results_timezone,
          rows_truncated,
        },
        question,
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

    const isPivoted = _isPivoted(series, settings);
    const areAllColumnsHidden = data?.cols.length === 0;

    if (!data) {
      return null;
    }

    if (areAllColumnsHidden) {
      const allFieldsHiddenImageUrl = getSubpathSafeUrl(
        "app/assets/img/hidden-field.png",
      );
      const allFieldsHiddenImage2xUrl = getSubpathSafeUrl(
        "app/assets/img/hidden-field@2x.png",
      );

      return (
        <div
          className={cx(
            CS.flexFull,
            CS.px1,
            CS.pb1,
            CS.textCentered,
            CS.flex,
            CS.flexColumn,
            CS.layoutCentered,
            { [CS.textSlateLight]: isDashboard, [CS.textSlate]: !isDashboard },
          )}
        >
          <img
            data-testid="Table-all-fields-hidden-image"
            width={99}
            src={allFieldsHiddenImageUrl}
            srcSet={`
              ${allFieldsHiddenImageUrl}   1x,
              ${allFieldsHiddenImage2xUrl} 2x
            `}
            className={CS.mb2}
          />
          <span
            className={cx(CS.h4, CS.textBold)}
          >{t`Every field is hidden right now`}</span>
        </div>
      );
    }

    return (
      <TableInteractive
        {...this.props}
        question={this.state.question}
        data={data}
        isPivoted={isPivoted}
        getColumnTitle={this.getColumnTitle}
        getColumnSortDirection={this.getColumnSortDirection}
      />
    );
  }
}

export const Table = Object.assign(TableComponent, TABLE_DEFINITION);
