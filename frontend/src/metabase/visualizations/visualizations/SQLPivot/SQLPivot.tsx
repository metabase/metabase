import { Component } from "react";
import { t } from "ttag";

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
import type {
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  ColumnSettingDefinition,
  VisualizationProps,
} from "../../types";
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

class SQLPivot extends Component<SQLPivotProps, SQLPivotState> {
  static getUiName = () => t`SQL Pivot`;
  static identifier = "sql_pivot";
  static iconName = "pivot_table";
  static canSavePng = false;

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

  static columnSettings = (column: any) => {
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
    
    // Debug logging
    console.log("SQLPivot getColumnTitle called with:", {
      columnIndex,
      dataAvailable: !!data,
      seriesAvailable: !!series,
      settingsAvailable: !!settings
    });
    
    if (!data) {
      console.warn("SQLPivot: No data available for getColumnTitle");
      return "";
    }

    const column = data.cols[columnIndex];
    if (!column) {
      console.warn("SQLPivot: No column found at index", columnIndex);
      return "";
    }

    try {
      // Use displayNameForColumn as fallback, similar to Table component
      // Note: getTitleForColumn expects (column, series, settings) order
      return getTitleForColumn(column, series, settings) || displayNameForColumn(column);
    } catch (error) {
      console.error("SQLPivot: Error getting column title:", error);
      return displayNameForColumn(column);
    }
  };

  _updateData({ series, settings, metadata }: VisualizationProps) {
    console.log("SQLPivot _updateData called with:", {
      seriesLength: series.length,
      settingsKeys: Object.keys(settings),
      pivotSettings: {
        rowColumn: settings["sqlpivot.row_column"],
        valueColumns: settings["sqlpivot.value_columns"],
        transpose: settings["sqlpivot.transpose"]
      }
    });

    const [{ card, data }] = series;
    console.log("Original data:", {
      colCount: data.cols.length,
      rowCount: data.rows.length,
      colNames: data.cols.map(col => col.name)
    });

    // construct a Question that is in-sync with query results
    const question = new Question(card, metadata);

    // Transform the data using SQL pivot logic
    const transformedData = transformSQLDataToPivot(
      data,
      settings as SQLPivotSettings,
    );

    console.log("Transformed data:", {
      colCount: transformedData.cols.length,
      rowCount: transformedData.rows.length,
      colNames: transformedData.cols.map(col => col.name)
    });

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
      columnIndexes.length > 0 ? columnIndexes : cols.map((_, i) => i);

    console.log("Final column indexes:", finalColumnIndexes);

    const finalData = {
      cols: finalColumnIndexes.map((i) => cols[i]),
      rows: rows.map((row) => finalColumnIndexes.map((i) => row[i])),
      results_timezone,
    };

    console.log("Final data for setState:", {
      colCount: finalData.cols.length,
      rowCount: finalData.rows.length,
      colNames: finalData.cols.map(col => col.name)
    });

    this.setState({
      data: finalData,
      question,
    });
  }

  render() {
    const { series, isDashboard, settings } = this.props;
    const { data } = this.state;

    if (!data) {
      return null;
    }

    const areAllColumnsHidden = data.cols.length === 0;

    if (areAllColumnsHidden) {
      return (
        <div style={{ 
          padding: "2rem", 
          textAlign: "center", 
          color: "#666" 
        }}>
          <p>{t`No columns to display. Please configure the pivot settings.`}</p>
        </div>
      );
    }

    return (
      <TableInteractive
        {...this.props}
        question={this.state.question}
        data={data}
        isPivoted={false}
        getColumnTitle={this.getColumnTitle}
        getColumnSortDirection={() => null}
      />
    );
  }
}

export default SQLPivot; 