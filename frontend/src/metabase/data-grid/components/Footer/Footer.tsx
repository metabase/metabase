import type { Table } from "@tanstack/react-table";
import cx from "classnames";
import { msgid, ngettext } from "ttag";

import { FOOTER_HEIGHT } from "metabase/data-grid/constants";
import { PaginationFooter } from "metabase/visualizations/components/PaginationFooter/PaginationFooter";

import S from "./Footer.module.css";

export interface FooterProps<TData> {
  table: Table<TData>;
  enablePagination?: boolean;
  showRowsCount?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const Footer = <TData,>({
  table,
  showRowsCount,
  enablePagination,
  className,
  style,
}: FooterProps<TData>) => {
  const wrapperAttributes = {
    "data-testid": "table-footer",
    className: cx(S.root, className),
    style: { height: `${FOOTER_HEIGHT}px`, ...style },
  };
  const total = table.getPrePaginationRowModel().rows.length;

  if (enablePagination) {
    const pagination = table.getState().pagination;

    const start = pagination.pageIndex * pagination.pageSize;
    const end =
      Math.min((pagination.pageIndex + 1) * pagination.pageSize, total) - 1;
    return (
      <div {...wrapperAttributes}>
        <PaginationFooter
          start={start}
          end={end}
          total={total}
          onPreviousPage={table.previousPage}
          onNextPage={table.nextPage}
        />
      </div>
    );
  }

  if (showRowsCount) {
    return (
      <div {...wrapperAttributes}>
        <span className={S.rowsCount}>
          {ngettext(msgid`${total} row`, `${total} rows`, total)}
        </span>
      </div>
    );
  }
  return null;
};
