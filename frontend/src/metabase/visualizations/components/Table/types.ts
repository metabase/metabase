import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    wrap?: boolean;
    enableReordering?: boolean;
  }
}

export type ExpandedColumnsState = Record<string, boolean>;
export type CellAlign = "left" | "right" | "middle";
export type BodyCellVariant = "text" | "pill" | "minibar";
export type RowIdVariant = "expandButton" | "indexOnly" | "indexExpand";
export type CellFormatter<TValue> = (value: TValue) => React.ReactNode;
