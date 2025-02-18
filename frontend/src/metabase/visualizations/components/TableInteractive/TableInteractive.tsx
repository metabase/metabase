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
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import { withMantineTheme } from "metabase/hoc/MantineTheme";
import { formatValue } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import {
  Table,
  useTableInstance,
} from "metabase/visualizations/components/Table";
import { ROW_ID_COLUMN_ID } from "metabase/visualizations/components/Table/constants";
import type {
  BodyCellVariant,
  ColumnOptions,
  RowIdVariant,
} from "metabase/visualizations/components/Table/types";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
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
import * as Lib from "metabase-lib";
import type { OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./TableInteractive.module.css";
import { useObjectDetail } from "./hooks/use-object-detail";
import { MiniBarCell } from "./cells/MiniBarCell";
import { HeaderCellWithColumnInfo } from "./cells/HeaderCellWithColumnInfo";

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
  onZoomRow?: (objectId: number | string) => void;
  rowIndexToPkMap?: Record<number, string>;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  getColumnTitle: any;
  isPivoted?: boolean;
  hasMetadataPopovers?: boolean;
  question: Question;
  mode: QueryClickActionsMode;
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
    getColumnTitle,
    hasMetadataPopovers = true,
    mode,
    className,
  }: TableProps,
  ref: Ref<HTMLDivElement>,
) {
  const queryBuilderMode = useSelector(getQueryBuilderMode);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const isRawTable = useSelector(getIsShowingRawTable);

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
    if (!question || !mode?.clickActions || !onVisualizationClick) {
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
  }, [isRawTable, mode, onVisualizationClick, question]);

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
      const isMinibar = columnSettings["show_mini_bar"];
      const cellVariant = getBodyCellVariant(col);
      const headerVariant = mode != null ? "light" : "outline";
      const getBackgroundColor = (value: RowValue, rowIndex: number) =>
        settings["table._cell_background_getter"]?.(value, rowIndex, col.name);

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
        header: () => {
          return (
            <HeaderCellWithColumnInfo
              infoPopoversDisabled={!hasMetadataPopovers || clicked != null}
              timezone={data.requested_timezone}
              question={question}
              column={col}
              name={columnName}
              align={align}
              sort={sortDirection}
              variant={headerVariant}
              // FIXME: provide onclick
              // onClick
            />
          );
        },
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
    mode,
    cols,
    columnFormatters,
    getColumnSortDirection,
    getColumnTitle,
    isPivoted,
    rows,
    settings,
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

  if (!width || !height) {
    return <div ref={ref} className={className} />;
  }

  return (
    <div
      ref={ref}
      className={cx(S.root, className)}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Table
        {...tableProps}
        onBodyCellClick={handleBodyCellClick}
        onHeaderCellClick={handleHeaderCellClick}
        onAddColumnClick={handleAddColumnButtonClick}
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
