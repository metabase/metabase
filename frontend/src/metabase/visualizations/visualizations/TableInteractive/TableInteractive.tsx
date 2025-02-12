import type { ColumnSizingState } from "@tanstack/react-table";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import { formatValue } from "metabase/lib/formatting";
import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import {
  type ColumnOptions,
  Table as TableView,
  useTableInstance,
} from "metabase/visualizations/components/Table";
import { ROW_ID_COLUMN_ID } from "metabase/visualizations/components/Table/constants";
import type {
  BodyCellVariant,
  RowIdVariant,
} from "metabase/visualizations/components/Table/types";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  getTableHeaderClickedObject,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  DatasetColumn,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import { useObjectDetail } from "./hooks/use-object-detail";

const getBodyCellVariant = (
  column: DatasetColumn,
  settings: ColumnSettings,
): BodyCellVariant => {
  if (settings["show_mini_bar"]) {
    return "minibar";
  }

  const isPill = isPK(column) || isFK(column);
  if (isPill) {
    return "pill";
  }

  return "text";
};

const getColumnIdFromPivotedColumnId = (pivotedColumnId: string) =>
  pivotedColumnId.split(":")[0];

interface TableProps extends VisualizationProps {
  onZoomRow?: (objectId: number | string) => void;
  rowIndexToPkMap?: Record<number, string>;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  getColumnTitle: any;
  isPivoted?: boolean;
  hasMetadataPopovers?: boolean;
  question: Question;
}

const getColumnOrder = (cols: DatasetColumn[], hasIndexColumn: boolean) => {
  const dataColumns = cols.map(col => col.name);
  if (!hasIndexColumn) {
    return dataColumns;
  }
  return [ROW_ID_COLUMN_ID, ...dataColumns];
};

const getColumnSizing = (
  cols: DatasetColumn[],
  widths: number[] = [],
): ColumnSizingState => {
  return cols.reduce((acc: ColumnSizingState, column, index) => {
    const width = widths[index];
    if (width != null) {
      acc[column.name] = width;
    }
    return acc;
  }, {});
};

export const _TableInteractive = ({
  data,
  series,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
  isPivoted = false,
  getColumnSortDirection,
  question,
  clicked,
  queryBuilderMode,
  getColumnTitle,
  isEmbeddingSdk,
  hasMetadataPopovers = true,
}: TableProps) => {
  const { rows, cols } = data;
  const prevColNamesRef = useRef<Set<string>>(
    new Set(cols.map(col => col.name)),
  );

  const columnOrder = useMemo(() => {
    return getColumnOrder(cols, settings["table.row_index"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, settings["table.row_index"]]);

  const columnSizing = useMemo(() => {
    return getColumnSizing(cols, settings["table.column_widths"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, settings["table.column_widths"]]);

  const onOpenObjectDetail = useObjectDetail(data);

  const handleBodyCellClick = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement, MouseEvent>,
      rowIndex: number,
      columnId: string,
    ) => {
      if (isPivoted) {
        columnId = getColumnIdFromPivotedColumnId(columnId);
      }

      if (columnId === ROW_ID_COLUMN_ID) {
        onOpenObjectDetail(rowIndex);
        return;
      }

      const columnIndex = data.cols.findIndex(col => col.name === columnId);
      const clickedRowData = getTableClickedObjectRowData(
        series as any,
        rowIndex,
        columnIndex,
        isPivoted,
        data,
      );

      const clicked = getTableCellClickedObject(
        data,
        settings,
        rowIndex,
        columnIndex,
        isPivoted,
        clickedRowData,
      );

      onVisualizationClick?.({
        ...clicked,
        element: event.currentTarget,
      });
    },
    [
      data,
      isPivoted,
      onOpenObjectDetail,
      onVisualizationClick,
      series,
      settings,
    ],
  );

  const handleHeaderCellClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>, columnId: string) => {
      if (isPivoted) {
        columnId = getColumnIdFromPivotedColumnId(columnId);
      }

      const columnIndex = data.cols.findIndex(col => col.name === columnId);
      if (columnIndex === -1) {
        return;
      }
      const clicked = getTableHeaderClickedObject(data, columnIndex, isPivoted);
      onVisualizationClick({ ...clicked, element: event.currentTarget });
    },
    [data, isPivoted, onVisualizationClick],
  );

  const handleColumnReordering = useCallback(
    (columnsOrder: string[]) => {
      const result = settings["table.columns"]?.slice() ?? [];

      const enabledIndices = result
        .map((col, index) => (col.enabled ? index : -1))
        .filter(index => index !== -1);

      columnsOrder.forEach((columnName, orderIndex) => {
        const sourceIndex = result.findIndex(col => col.name === columnName);
        if (sourceIndex !== -1) {
          const targetIndex = enabledIndices[orderIndex];

          const [column] = result.splice(sourceIndex, 1);
          result.splice(targetIndex, 0, column);

          if (sourceIndex > targetIndex) {
            for (let i = orderIndex + 1; i < enabledIndices.length; i++) {
              enabledIndices[i]++;
            }
          }
        }
      });

      onUpdateVisualizationSettings({
        "table.columns": result,
      });
    },
    [onUpdateVisualizationSettings, settings],
  );

  const handleAddColumnButtonClick = useMemo(() => {
    if (!onVisualizationClick) {
      return undefined;
    }

    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      onVisualizationClick({
        columnShortcuts: true,
        element: e.currentTarget,
      });
    };
  }, [onVisualizationClick]);

  const columnFormatters = useMemo(() => {
    return cols.map(col => {
      const columnSettings = settings.column?.(col);
      return cachedFormatter(value =>
        formatValue(value, {
          ...columnSettings,
          column: col,
          type: "cell",
          jsx: true,
          rich: true,
        }),
      );
    });
  }, [cols, settings]);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((col, columnIndex) => {
      const columnSettings = settings.column?.(col) ?? {};

      const wrap = Boolean(columnSettings["text_wrapping"]);
      const cellVariant = getBodyCellVariant(col, columnSettings);
      const getBackgroundColor = (value: RowValue, rowIndex: number) =>
        settings["table._cell_background_getter"]?.(value, rowIndex, col.name);

      const formatter = columnFormatters[columnIndex];
      const calculateColumnExtent = () =>
        getColumnExtent(cols, rows, columnIndex);
      const columnName = getColumnTitle(columnIndex);

      let align;
      let id;
      let sortDirection;
      if (isPivoted) {
        align = columnIndex === 0 ? "right" : columnSettings["text_align"];
        id = `${col.name}:${columnIndex}`;
      } else {
        align = columnSettings["text_align"];
        id = col.name;
        sortDirection = getColumnSortDirection(columnIndex);
      }

      return {
        id,
        name: columnName,
        accessorFn: (row: RowValues) => row[columnIndex],
        cellVariant,
        align,
        wrap,
        sortDirection,
        enableResizing: true,
        getBackgroundColor,
        formatter,
        getColumnExtent: calculateColumnExtent,
      };
    });
  }, [
    cols,
    columnFormatters,
    getColumnSortDirection,
    getColumnTitle,
    isPivoted,
    rows,
    settings,
  ]);

  const renderHeaderDecorator = useCallback(
    (columnId: string, isDragging: boolean, children: React.ReactNode) => {
      if (!hasMetadataPopovers || clicked) {
        return children;
      }

      if (isPivoted) {
        columnId = getColumnIdFromPivotedColumnId(columnId);
      }

      const query = question?.query();
      const stageIndex = -1;

      const column = cols.find(col => col.name === columnId);
      if (!column) {
        return children;
      }

      return (
        <QueryColumnInfoPopover
          position="bottom-start"
          query={query}
          stageIndex={-1}
          column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
          timezone={data.results_timezone}
          disabled={isDragging}
          openDelay={500}
          showFingerprintInfo
        >
          <div style={{ width: "100%", height: "100%" }}>{children}</div>
        </QueryColumnInfoPopover>
      );
    },
    [
      clicked,
      cols,
      data.results_timezone,
      hasMetadataPopovers,
      isPivoted,
      question,
    ],
  );

  const handleColumnResize = useCallback(
    (columnSizing: ColumnSizingState) => {
      const newWidths = cols.map(col => columnSizing[col.name] ?? 0);
      onUpdateVisualizationSettings({
        "table.column_widths": newWidths,
      });
    },
    [cols, onUpdateVisualizationSettings],
  );

  const rowIdColumn: RowIdVariant | undefined = useMemo(() => {
    const hasAggregation = cols.some(column => column.source === "aggregation");
    const isNotebookPreview = queryBuilderMode === "notebook";
    const isModelEditor = queryBuilderMode === "dataset";
    const hasObjectDetail =
      !(isPivoted || hasAggregation || isNotebookPreview || isModelEditor) &&
      !isEmbeddingSdk;

    const shouldShowRowIndex =
      settings["table.row_index"] && !isNotebookPreview && !isModelEditor;
    if (!hasObjectDetail) {
      return shouldShowRowIndex ? "indexOnly" : undefined;
    }

    return shouldShowRowIndex ? "indexExpand" : "expandButton";
  }, [cols, isEmbeddingSdk, isPivoted, queryBuilderMode, settings]);

  const tableProps = useTableInstance({
    data: rows,
    rowIdColumn,
    columnOrder,
    columnSizing,
    columnsOptions,
    onColumnResize: handleColumnResize,
    onColumnReorder: handleColumnReordering,
  });

  useEffect(() => {
    const currentColNames = new Set(cols.map(col => col.name));
    const prevColNames = prevColNamesRef.current;

    const isSame =
      prevColNames.size === currentColNames.size &&
      [...prevColNames].every(name => currentColNames.has(name));

    if (!isSame) {
      prevColNamesRef.current = currentColNames;
      tableProps.measureColumnWidths();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, tableProps.measureColumnWidths]);

  if (width == null || height == null) {
    return null;
  }

  return (
    <TableView
      {...tableProps}
      width={width}
      height={height}
      renderHeaderDecorator={renderHeaderDecorator}
      onBodyCellClick={handleBodyCellClick}
      onHeaderCellClick={handleHeaderCellClick}
      onAddColumnClick={handleAddColumnButtonClick}
    />
  );
};

interface StateProps {
  queryBuilderMode: string;
  isEmbeddingSdk: boolean;
  scrollToLastColumn: boolean;
  isRawTable: boolean;
}

const mapStateToProps = (state: any): StateProps => ({
  queryBuilderMode: getQueryBuilderMode(state),
  isEmbeddingSdk: getIsEmbeddingSdk(state),
  scrollToLastColumn: getUiControls(state).scrollToLastColumn,
  isRawTable: getIsShowingRawTable(state),
});

export const TableInteractive = connect(
  mapStateToProps,
  null,
)(_TableInteractive);
