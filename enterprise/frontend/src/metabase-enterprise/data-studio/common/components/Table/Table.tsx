import {
  type ColumnDef,
  type Row,
  type Table,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  type VirtualItem,
  type Virtualizer,
  useVirtualizer,
} from "@tanstack/react-virtual";
import { type CSSProperties, type ReactNode, useState } from "react";

import { Badge, Icon } from "metabase/ui";

import S from "./Table.module.css";

const DEFAULT_ROW_HEIGHT = 47;

export const TableComponent = <
  T extends Record<string, any> & { children?: T[] },
>({
  data,
  columns,
  onSelect,
}: {
  data: T[];
  columns: ColumnDef<T, ReactNode>[];
  onSelect: (item: T) => void;
}) => {
  const [scrollRef, setScrollRef] = useState<HTMLDivElement | null>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.children,
    initialState: {
      expanded: true,
    },
  });

  return (
    <div className={S.scrollContainer} ref={(e) => setScrollRef(e)}>
      {/* Even though we're still using semantic table tags, we must use CSS grid and flexbox for dynamic row heights */}
      <table className={S.table}>
        <thead className={S.header}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className={S.row}>
              {headerGroup.headers.map((header) => {
                const headerContent = flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                );
                return (
                  <th
                    key={header.id}
                    style={{
                      display: "flex",
                      ...getColumWidthStyle(header.column.columnDef),
                    }}
                  >
                    {headerContent && (
                      <Badge
                        onClick={header.column.getToggleSortingHandler()}
                        classNames={{
                          root: S.headerBadge,
                          label: S.headerBadgeLabel,
                        }}
                        rightSection={
                          {
                            asc: <Icon name="chevronup" size={10} />,
                            desc: <Icon name="chevrondown" size={10} />,
                          }[header.column.getIsSorted() as string] ?? null
                        }
                      >
                        {headerContent}
                      </Badge>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        {scrollRef && (
          <TableBody
            table={table}
            tableContainerRef={scrollRef}
            onSelect={onSelect}
          />
        )}
      </table>
    </div>
  );
};

interface TableBodyProps<T> {
  table: Table<T>;
  tableContainerRef: HTMLDivElement;
  onSelect: (item: T) => void;
}

function TableBody<T>({
  table,
  tableContainerRef,
  onSelect,
}: TableBodyProps<T>) {
  const { rows } = table.getRowModel();

  // Important: Keep the row virtualizer in the lowest component possible to avoid unnecessary re-renders.
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => DEFAULT_ROW_HEIGHT, //estimate row height for accurate scrollbar dragging
    getScrollElement: () => tableContainerRef,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 5,
  });

  return (
    <tbody
      className={S.body}
      style={{
        display: "grid",
        height: `${rowVirtualizer.getTotalSize()}px`, //tells scrollbar how big the table is
        position: "relative", //needed for absolute positioning of rows
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index] as Row<T>;
        return (
          <TableBodyRow
            key={row.id}
            row={row}
            virtualRow={virtualRow}
            rowVirtualizer={rowVirtualizer}
            onSelect={onSelect}
          />
        );
      })}
    </tbody>
  );
}

interface TableBodyRowProps<T> {
  row: Row<T>;
  virtualRow: VirtualItem;
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
  onSelect: (item: T) => void;
}

function TableBodyRow<T>({
  row,
  virtualRow,
  rowVirtualizer,
  onSelect,
}: TableBodyRowProps<T>) {
  const { depth } = row;

  const canExpand = row.getCanExpand();

  return (
    <tr
      data-index={virtualRow.index} //needed for dynamic row height measurement
      ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
      key={row.id}
      className={S.row}
      style={{
        position: "absolute",
        transform: `translateY(${virtualRow.start}px)`, //this should always be a `style` as it changes on scroll
        paddingLeft: `calc(${depth * 18}px + 1rem)`,
      }}
      onClick={
        canExpand
          ? row.getToggleExpandedHandler()
          : () => onSelect?.(row.original)
      }
    >
      {row.getVisibleCells().map((cell, index) => {
        return (
          <td
            key={cell.id}
            className={S.cell}
            style={{
              ...getColumWidthStyle(cell.column.columnDef),
            }}
          >
            {canExpand && index === 0 && (
              <Icon
                size={10}
                name={row.getIsExpanded() ? "chevrondown" : "chevronright"}
              />
            )}
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

const getColumWidthStyle = <T,>(column: ColumnDef<T>): CSSProperties => {
  if (column.meta?.width === "auto") {
    return {
      flexGrow: 1,
      flexBasis: 0,
    };
  }
  return {
    width: column.size,
  };
};
