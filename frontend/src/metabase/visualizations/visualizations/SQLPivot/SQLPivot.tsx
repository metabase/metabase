import { Component } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { displayNameForColumn } from "metabase/lib/formatting";
import { TableInteractive } from "metabase/visualizations/components/TableInteractive";
import {
  columnSettings,
  getTitleForColumn,
} from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import Question from "metabase-lib/v1/Question";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import type { ColumnSettingDefinition, VisualizationProps } from "../../types";

import { SQL_PIVOT_SETTINGS } from "./settings";
import type { SQLPivotSettings } from "./utils";
import {
  checkSQLPivotRenderable,
  isSQLPivotSensible,
  transformSQLDataToPivot,
} from "./utils";

interface SQLPivotProps extends VisualizationProps {
  isShowingDetailsOnlyColumns?: boolean;
}

interface SQLPivotState {
  data: Pick<DatasetData, "cols" | "rows" | "results_timezone"> | null;
  question: Question | null;
}

export class SQLPivot extends Component<SQLPivotProps, SQLPivotState> {
  static getUiName = () => t`SQL Pivot`;
  static identifier = "sql_pivot";
  static iconName = "pivot_table";
  static canSavePng = false;
  static maxDimensionsSupported = 2;

  static minSize = getMinSize("table");
  static defaultSize = getDefaultSize("table");

  static isSensible = isSQLPivotSensible;

  static isLiveResizable() {
    return false;
  }

  static checkRenderable(
    [{ data }]: [{ data: DatasetData }],
    settings: VisualizationSettings,
  ) {
    checkSQLPivotRenderable(data, settings as SQLPivotSettings);
  }

  static settings = {
    ...columnSettings({ hidden: true }),
    ...SQL_PIVOT_SETTINGS,
  };

  static columnSettings = () => {
    const settings: Record<
      string,
      ColumnSettingDefinition<unknown, unknown>
    > = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column) => displayNameForColumn(column),
      },
    };

    return settings;
  };

  constructor(props: SQLPivotProps) {
    super(props);
    this.state = {
      data: null,
      question: null,
    };
  }

  componentDidMount() {
    this._updateData(this.props);
  }

  componentDidUpdate(prevProps: SQLPivotProps) {
    if (
      prevProps.series !== this.props.series ||
      prevProps.settings !== this.props.settings
    ) {
      this._updateData(this.props);
    }
  }

  getColumnTitle = (columnIndex: number) => {
    const { settings, series } = this.props;
    const { data } = this.state;

    if (!data) {
      return "";
    }

    const column = data.cols[columnIndex];
    if (!column) {
      return "";
    }

    // Check if this column's label should be hidden
    const hiddenColumnLabels =
      (settings as any)["sqlpivot.hidden_column_labels"] || [];
    if (hiddenColumnLabels.includes(column.name)) {
      return "";
    }

    try {
      // Use displayNameForColumn as fallback, similar to Table component
      // Note: getTitleForColumn expects (column, series, settings) order
      return (
        getTitleForColumn(column, series, settings) ||
        displayNameForColumn(column)
      );
    } catch (error) {
      return displayNameForColumn(column);
    }
  };

  _updateData({ series, settings, metadata }: VisualizationProps) {
    const [{ card, data }] = series;

    // construct a Question that is in-sync with query results
    const question = new Question(card, metadata);

    // Transform the data using SQL pivot logic
    const transformedData = transformSQLDataToPivot(
      data,
      settings as SQLPivotSettings,
    );

    // Apply column filtering if needed
    const { cols, rows, results_timezone } = transformedData;
    const columnSettings = settings["table.columns"] ?? [];
    const columnIndexes = findColumnIndexesForColumnSettings(
      cols,
      columnSettings,
    ).filter(
      (columnIndex, settingIndex) =>
        columnIndex >= 0 &&
        (this.props.isShowingDetailsOnlyColumns ||
          (cols[columnIndex].visibility_type !== "details-only" &&
            columnSettings[settingIndex]?.enabled !== false)),
    );

    // If no column filtering is applied, use all columns
    const finalColumnIndexes =
      columnIndexes.length > 0
        ? columnIndexes
        : cols.map((_: any, i: number) => i);

    // Transform and validate the data structure
    const transformedRows = rows
      .map((row: any) => {
        // Ensure row is an array before mapping
        if (!Array.isArray(row)) {
          console.warn("SQLPivot: Invalid row data - not an array:", row);
          return null;
        }
        return finalColumnIndexes.map((i: number) => row[i]);
      })
      .filter((row: any) => row !== null); // Remove any invalid rows

    const finalData = {
      cols: finalColumnIndexes.map((i: number) => cols[i]),
      rows: transformedRows,
      results_timezone,
    };

    this.setState({
      data: finalData,
      question,
    });
  }

  render() {
    const { data } = this.state;

    if (!data) {
      return null;
    }

    const areAllColumnsHidden = data.cols.length === 0;

    if (areAllColumnsHidden) {
      return (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: color("text-medium"),
          }}
        >
          <p>{t`No columns to display. Please configure the pivot settings.`}</p>
        </div>
      );
    }

    // Create a properly structured series array with transformed data
    // This ensures that getTableClickedObjectRowData works correctly
    const transformedSeries = [
      {
        ...this.props.series[0],
        data: data,
      },
    ];

    return (
      <TableInteractive
        {...this.props}
        series={transformedSeries}
        question={this.state.question}
        data={data}
        isPivoted={false}
        getColumnTitle={this.getColumnTitle}
        getColumnSortDirection={() => null}
      />
    );
  }
}
