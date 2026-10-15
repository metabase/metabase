import type { Table } from "@tanstack/react-table";
import cx from "classnames";
import type { ReactNode } from "react";
import { msgid, ngettext, t } from "ttag";

import { FOOTER_HEIGHT } from "metabase/data-grid/constants";

import { PaginationFooter } from "../PaginationFooter/PaginationFooter";

import S from "./Footer.module.css";

export interface PaginationMessageParams {
  start: number;
  end: number;
  total: number;
}

export interface FooterProps<TData> {
  table: Table<TData>;
  enablePagination?: boolean;
  showRowsCount?: boolean;
  style?: React.CSSProperties;
  className?: string;
  tableFooterExtraButtons?: React.ReactNode;
  formatRowsCountMessage?: (total: number) => ReactNode;
  formatPaginationMessage?: (params: PaginationMessageParams) => ReactNode;
}

export const Footer = <TData,>({
  table,
  showRowsCount,
  enablePagination,
  className,
  style,
  tableFooterExtraButtons,
  formatRowsCountMessage,
  formatPaginationMessage,
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
    const message = formatPaginationMessage
      ? formatPaginationMessage({ start, end, total })
      : t`Rows ${start + 1}-${end + 1} of ${total}`;
    return (
      <div {...wrapperAttributes}>
        {tableFooterExtraButtons}
        <PaginationFooter
          start={start}
          end={end}
          total={total}
          message={message}
          onPreviousPage={table.previousPage}
          onNextPage={table.nextPage}
        />
      </div>
    );
  }

  if (showRowsCount) {
    return (
      <div {...wrapperAttributes}>
        {tableFooterExtraButtons}
        <span className={S.rowsCount}>
          {formatRowsCountMessage
            ? formatRowsCountMessage(total)
            : ngettext(msgid`${total} row`, `${total} rows`, total)}
        </span>
      </div>
    );
  }
  return null;
};
