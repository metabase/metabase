import cx from "classnames";
import type {
  ColHTMLAttributes,
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import AdminS from "metabase/css/admin.module.css";

import S from "./TableElements.module.css";
import type { ContainerBreakpointName, ResponsiveProps } from "./utils";

const HIDE_AT_CLASS_NAMES: Record<ContainerBreakpointName, string> = {
  xs: S.hideAtXs,
  sm: S.hideAtSm,
  md: S.hideAtMd,
};

function getHideAtClassName(breakpoint: ContainerBreakpointName | undefined) {
  if (!breakpoint) {
    return undefined;
  }
  return HIDE_AT_CLASS_NAMES[breakpoint];
}

type TableProps = TableHTMLAttributes<HTMLTableElement>;

export function Table({ className, ...props }: TableProps) {
  return (
    <table {...props} className={cx(AdminS.ContentTable, S.table, className)} />
  );
}

type TBodyProps = HTMLAttributes<HTMLTableSectionElement>;

export function TBody({ className, ...props }: TBodyProps) {
  return <tbody {...props} className={cx(S.body, className)} />;
}

type ColumnHeaderProps = ThHTMLAttributes<HTMLTableCellElement> &
  ResponsiveProps;

export function ColumnHeader({
  hideAtContainerBreakpoint,
  className,
  ...props
}: ColumnHeaderProps) {
  return (
    <th
      {...props}
      className={cx(
        S.columnHeader,
        getHideAtClassName(hideAtContainerBreakpoint),
        className,
      )}
    />
  );
}

type ItemCellProps = TdHTMLAttributes<HTMLTableCellElement> & ResponsiveProps;

export function ItemCell({
  hideAtContainerBreakpoint,
  className,
  ...props
}: ItemCellProps) {
  return (
    <td
      {...props}
      className={cx(
        S.itemCell,
        getHideAtClassName(hideAtContainerBreakpoint),
        className,
      )}
    />
  );
}

type ItemNameCellProps = TdHTMLAttributes<HTMLTableCellElement>;

export function ItemNameCell({ className, ...props }: ItemNameCellProps) {
  return <td {...props} className={cx(S.itemNameCell, className)} />;
}

type TableColumnProps = ColHTMLAttributes<HTMLTableColElement> &
  ResponsiveProps;

export function TableColumn({
  hideAtContainerBreakpoint,
  className,
  ...props
}: TableColumnProps) {
  return (
    <col
      {...props}
      className={cx(getHideAtClassName(hideAtContainerBreakpoint), className)}
    />
  );
}
