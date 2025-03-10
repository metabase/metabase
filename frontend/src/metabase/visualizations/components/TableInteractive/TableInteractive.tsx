import type { CellContext, ColumnSizingState } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";
import {
  type Ref,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/components/ErrorMessage";
import ExplicitSize from "metabase/components/ExplicitSize";
import ExternalLink from "metabase/core/components/ExternalLink";
import { DataGrid } from "metabase/data-grid";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type {
  BodyCellVariant,
  ColumnOptions,
  DataGridTheme,
  RowIdColumnOptions,
} from "metabase/data-grid/types";
import { withMantineTheme } from "metabase/hoc/MantineTheme";
import {
  memoize,
  useMemoizedCallback,
} from "metabase/hooks/use-memoized-callback";
import { formatValue } from "metabase/lib/formatting";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { Flex, type MantineTheme } from "metabase/ui";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  getTableHeaderClickedObject,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type {
  QueryClickActionsMode,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { ClickObject, OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import { isFK, isID, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./TableInteractive.module.css";
import {
  HeaderCellWithColumnInfo,
  type HeaderCellWithColumnInfoProps,
} from "./cells/HeaderCellWithColumnInfo";
import { MiniBarCell } from "./cells/MiniBarCell";
import { useObjectDetail } from "./hooks/use-object-detail";

const getBodyCellVariant = (column: DatasetColumn): BodyCellVariant => {
  const isPill = isPK(column) || isFK(column);
  if (isPill) {
    return "pill";
  }

  return "text";
};

const getColumnIdFromPivotedColumnId = (pivotedColumnId: string) =>
  pivotedColumnId.split(":")[0];

interface TableProps extends VisualizationProps {
  rowIndexToPkMap?: Record<number, string>;
  isPivoted?: boolean;
  hasMetadataPopovers?: boolean;
  question: Question;
  mode: QueryClickActionsMode;
  scrollToColumn?: number;
  scrollToLastColumn?: boolean;
  theme: MantineTheme;
  renderEmptyMessage?: boolean;
  getColumnTitle: (columnIndex: number) => string;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
  renderTableHeader: HeaderCellWithColumnInfoProps["renderTableHeader"];
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  onZoomRow?: (objectId: number | string) => void;
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

export const TableInteractiveInner = forwardRef(function TableInteractiveInner(
  {
    className,
    data,
    series,
    height,
    settings,
    width,
    isPivoted = false,
    question,
    clicked,
    hasMetadataPopovers = true,
    mode,
    theme,
    scrollToColumn,
    renderEmptyMessage,
    getColumnTitle,
    renderTableHeader,
    visualizationIsClickable,
    getColumnSortDirection,
    onVisualizationClick,
    onUpdateVisualizationSettings,
  }: TableProps,
  ref: Ref<HTMLDivElement>,
) {
  const tableTheme = theme?.other?.table;
  const dispatch = useDispatch();
  const queryBuilderMode = useSelector(getQueryBuilderMode);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const isRawTable = useSelector(getIsShowingRawTable);
  const scrollToLastColumn = useSelector(
    state => getUiControls(state).scrollToLastColumn,
  );

  const { rows, cols } = data;

  const columnOrder = useMemo(() => {
    return getColumnOrder(cols, settings["table.row_index"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, settings["table.row_index"]]);

  const columnSizingMap = useMemo(() => {
    return getColumnSizing(cols, settings["table.column_widths"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, settings["table.column_widths"]]);

  const onOpenObjectDetail = useObjectDetail(data);

  const getIsCellClickable = useMemoizedCallback(
    (clicked: ClickObject) => {
      return visualizationIsClickable(clicked);
    },
    [onVisualizationClick, visualizationIsClickable],
  );

  const getCellClickedObject = useMemoizedCallback(
    (datasetColumnIndex: number, rowIndex: number) => {
      const clickedRowData = getTableClickedObjectRowData(
        series,
        rowIndex,
        datasetColumnIndex,
        isPivoted,
        data,
      );

      const clicked = getTableCellClickedObject(
        data,
        settings,
        rowIndex,
        datasetColumnIndex,
        isPivoted,
        clickedRowData,
      );

      return clicked;
    },
    [series, isPivoted, data, settings],
  );

  const columnFormatters = useMemo(() => {
    return cols.map(col => {
      const columnSettings = settings.column?.(col);
      const columnIndex = cols.findIndex(c => c.name === col.name);

      return memoize((value, rowIndex) => {
        const clicked = getCellClickedObject(columnIndex, rowIndex);
        return formatValue(value, {
          ...columnSettings,
          type: "cell",
          jsx: true,
          rich: true,
          clicked,
        });
      });
    });
  }, [cols, settings, getCellClickedObject]);

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
      const formatter = columnFormatters[columnIndex];
      const formattedValue = formatter(
        data.rows[rowIndex][columnIndex],
        rowIndex,
      );
      const clicked = getCellClickedObject(columnIndex, rowIndex);

      const isLink = (formattedValue as any)?.type === ExternalLink;
      if (getIsCellClickable(clicked) && !isLink) {
        onVisualizationClick?.({
          ...clicked,
          element: event.currentTarget,
        });
      }
    },
    [
      data,
      isPivoted,
      columnFormatters,
      getIsCellClickable,
      getCellClickedObject,
      onOpenObjectDetail,
      onVisualizationClick,
    ],
  );

  const handleHeaderCellClick = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement, MouseEvent>,
      columnId?: string,
    ) => {
      if (!columnId) {
        return;
      }

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
      const newColumns = settings["table.columns"]?.slice() ?? [];

      const enabledIndices = newColumns
        .map((col, index) => (col.enabled ? index : -1))
        .filter(index => index !== -1);

      columnsOrder.forEach((columnName, orderIndex) => {
        const sourceIndex = newColumns.findIndex(
          col => col.name === columnName,
        );
        if (sourceIndex !== -1) {
          const targetIndex = enabledIndices[orderIndex];

          const [column] = newColumns.splice(sourceIndex, 1);
          newColumns.splice(targetIndex, 0, column);

          if (sourceIndex > targetIndex) {
            for (let i = orderIndex + 1; i < enabledIndices.length; i++) {
              enabledIndices[i]++;
            }
          }
        }
      });

      const newEnabledColumns = newColumns.filter(col => col.enabled);
      const savedWidths = settings["table.column_widths"];
      const newWidths =
        Array.isArray(savedWidths) &&
        savedWidths.length === newEnabledColumns.length
          ? newEnabledColumns.map(c => columnSizingMap[c.name])
          : undefined;

      const settingsUpdate = {
        "table.columns": newColumns,
        "table.column_widths": newWidths,
      };

      onUpdateVisualizationSettings(settingsUpdate);
    },
    [onUpdateVisualizationSettings, settings, columnSizingMap],
  );

  const handleAddColumnButtonClick = useMemo(() => {
    if (
      !question ||
      !mode?.clickActions ||
      !onVisualizationClick ||
      isPivoted
    ) {
      return undefined;
    }

    for (const action of mode.clickActions) {
      const res = action({
        question,
        clicked: {
          columnShortcuts: true,
          extraData: {
            isRawTable,
          },
        },
      });
      if (res?.length > 0) {
        return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          onVisualizationClick({
            columnShortcuts: true,
            element: e.currentTarget,
          });
        };
      }
    }
  }, [isRawTable, mode, onVisualizationClick, question, isPivoted]);

  const columnsOptions: ColumnOptions<RowValues, RowValue>[] = useMemo(() => {
    return cols.map((col, columnIndex) => {
      const columnSettings = settings.column?.(col) ?? {};

      const wrap = Boolean(columnSettings["text_wrapping"]);
      const isMinibar = columnSettings["show_mini_bar"];
      const cellVariant = getBodyCellVariant(col);
      const headerVariant = mode != null ? "light" : "outline";
      const getBackgroundColor = memoize(
        (value: RowValue, rowIndex: number) =>
          settings["table._cell_background_getter"]?.(
            value,
            rowIndex,
            col.name,
          ) ?? tableTheme?.cell?.backgroundColor,
      );

      const formatter = columnFormatters[columnIndex];
      const columnName = getColumnTitle(columnIndex);

      let align;
      let id;
      let sortDirection: "asc" | "desc" | undefined;
      if (isPivoted) {
        align = columnIndex === 0 ? "right" : columnSettings["text_align"];
        id = `${col.name}:${columnIndex}`;
      } else {
        align = columnSettings["text_align"];
        id = col.name;
        sortDirection = getColumnSortDirection(columnIndex);
      }

      const options: ColumnOptions<RowValues, RowValue> = {
        id,
        name: columnName,
        accessorFn: (row: RowValues) => row[columnIndex],
        cellVariant,
        getCellClassName: value =>
          cx("test-TableInteractive-cellWrapper", {
            [S.pivotedFirstColumn]: columnIndex === 0 && isPivoted,
            "test-Table-ID": value != null && isID(col),
            "test-Table-FK": value != null && isFK(col),
            "test-TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
            "test-TableInteractive-cellWrapper--lastColumn":
              columnIndex === cols.length - 1,
            "test-TableInteractive-emptyCell": value == null,
          }),
        header: () => {
          return (
            <HeaderCellWithColumnInfo
              className={cx({
                [S.pivotedFirstColumn]: columnIndex === 0 && isPivoted,
              })}
              infoPopoversDisabled={!hasMetadataPopovers}
              timezone={data.results_timezone}
              question={question}
              column={col}
              name={columnName}
              align={align}
              sort={sortDirection}
              variant={headerVariant}
              columnIndex={columnIndex}
              theme={theme}
              renderTableHeader={renderTableHeader}
            />
          );
        },
        headerClickTargetSelector: "[data-header-click-target]",
        align,
        wrap,
        sortDirection,
        enableResizing: true,
        getBackgroundColor,
        formatter,
      };

      if (isMinibar) {
        options.cell = ({
          getValue,
          row,
        }: CellContext<RowValues, RowValue>) => {
          const value = getValue();
          const backgroundColor = getBackgroundColor(value, row?.index);
          const columnExtent = getColumnExtent(cols, rows, columnIndex);

          return (
            <MiniBarCell
              rowIndex={row.index}
              columnId={id}
              align={align}
              backgroundColor={backgroundColor}
              value={value}
              formatter={formatter}
              extent={columnExtent}
            />
          );
        };
      }

      return options;
    });
  }, [
    theme,
    hasMetadataPopovers,
    data,
    question,
    mode,
    renderTableHeader,
    cols,
    getColumnSortDirection,
    getColumnTitle,
    columnFormatters,
    isPivoted,
    rows,
    settings,
    tableTheme,
  ]);

  const handleColumnResize = useCallback(
    (columnSizing: ColumnSizingState) => {
      const newWidths = cols.map(col => columnSizing[col.name] ?? 0);
      onUpdateVisualizationSettings({
        "table.column_widths": newWidths,
      });
    },
    [cols, onUpdateVisualizationSettings],
  );

  const rowId: RowIdColumnOptions | undefined = useMemo(() => {
    const getBackgroundColor = memoize((rowIndex: number) =>
      settings["table._cell_background_getter"]?.(null, rowIndex),
    );

    const hasAggregation = cols.some(column => column.source === "aggregation");
    const isNotebookPreview = queryBuilderMode === "notebook";
    const isModelEditor = queryBuilderMode === "dataset";
    const hasObjectDetail =
      !(isPivoted || hasAggregation || isNotebookPreview || isModelEditor) &&
      !isEmbeddingSdk;

    const shouldShowRowIndex =
      settings["table.row_index"] && !isNotebookPreview && !isModelEditor;
    if (!hasObjectDetail && !shouldShowRowIndex) {
      return undefined;
    }

    return {
      variant: shouldShowRowIndex ? "indexExpand" : "expandButton",
      getBackgroundColor,
    };
  }, [cols, isEmbeddingSdk, isPivoted, queryBuilderMode, settings]);

  const dataGridTheme: DataGridTheme = useMemo(() => {
    return {
      fontSize: tableTheme.cell.fontSize,
      cell: {
        backgroundColor: tableTheme.cell.backgroundColor,
        textColor: tableTheme.cell.textColor,
      },
      pillCell: {
        backgroundColor: tableTheme.idColumn?.backgroundColor,
        textColor: tableTheme.idColumn?.textColor,
      },
    };
  }, [tableTheme]);

  const tableProps = useDataGridInstance({
    data: rows,
    rowId,
    columnOrder,
    columnSizingMap,
    columnsOptions,
    theme: dataGridTheme,
    onColumnResize: handleColumnResize,
    onColumnReorder: handleColumnReordering,
  });
  const { measureColumnWidths, virtualGrid } = tableProps;

  useEffect(() => {
    if (Object.values(columnSizingMap).length === 0) {
      measureColumnWidths();
    }
  }, [cols, measureColumnWidths, columnSizingMap]);

  const scrolledColumnRef = useRef<number | null>(null);
  useEffect(() => {
    const hasColumns = virtualGrid.virtualColumns.length > 0;
    if (hasColumns && scrollToLastColumn) {
      virtualGrid.columnVirtualizer.scrollToIndex(
        tableProps.table.getAllColumns().length,
        {
          align: "end",
        },
      );
      dispatch(setUIControls({ scrollToLastColumn: false }));
    } else if (
      scrollToColumn != null &&
      scrolledColumnRef.current !== scrollToColumn
    ) {
      virtualGrid.columnVirtualizer.scrollToIndex(scrollToColumn);
      scrolledColumnRef.current = scrollToColumn;
    }
  }, [
    scrollToColumn,
    scrollToLastColumn,
    dispatch,
    tableProps.table,
    virtualGrid,
  ]);

  const handleScroll = useCallback(() => {
    if (clicked === null) {
      return;
    }

    onVisualizationClick(undefined);
  }, [clicked, onVisualizationClick]);

  const emptyState = useMemo(
    () =>
      renderEmptyMessage ? (
        <Flex h="100%">
          <ErrorMessage
            type="noRows"
            title={t`No results!`}
            message={t`This may be the answer you’re looking for. If not, try removing or changing your filters to make them less specific.`}
            action={undefined}
          />
        </Flex>
      ) : null,
    [renderEmptyMessage],
  );

  if (!width || !height) {
    return <div ref={ref} className={className} />;
  }

  return (
    <div ref={ref} className={cx(S.root, className)}>
      <DataGrid
        {...tableProps}
        emptyState={emptyState}
        onBodyCellClick={handleBodyCellClick}
        onAddColumnClick={handleAddColumnButtonClick}
        onHeaderCellClick={handleHeaderCellClick}
        onScroll={handleScroll}
      />
    </div>
  );
});

export const TableInteractive = _.compose(
  withMantineTheme,
  ExplicitSize({
    refreshMode: "throttle",
  }),
)(TableInteractiveInner);
