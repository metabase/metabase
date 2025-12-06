import type { Table } from "@tanstack/react-table";
import cx from "classnames";
import { msgid, ngettext } from "ttag";

import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { getRowCountMessage } from "metabase/common/utils/get-row-count-message";
import { FOOTER_HEIGHT } from "metabase/data-grid/constants";
import { PaginationFooter } from "metabase/visualizations/components/PaginationFooter/PaginationFooter";

import S from "./Footer.module.css";

export interface FooterProps<TData> {
  table: Table<TData>;
  enablePagination?: boolean;
  paginationTotal?: number;
  paginationPageIndex?: number;
  onPaginationChange?: (pageIndex: number) => void;
  showRowsCount?: boolean;
  rowsTruncated?: number;
  style?: React.CSSProperties;
  className?: string;
  tableFooterExtraButtons?: React.ReactNode;
}

export const Footer = <TData,>({
  table,
  showRowsCount,
  enablePagination,
  paginationTotal,
  paginationPageIndex,
  onPaginationChange,
  className,
  style,
  tableFooterExtraButtons,
  rowsTruncated,
}: FooterProps<TData>) => {
  const formatNumber = useNumberFormatter();
  const wrapperAttributes = {
    "data-testid": "table-footer",
    className: cx(S.root, className),
    style: { height: `${FOOTER_HEIGHT}px`, ...style },
  };
  const clientSideTotal = table.getPrePaginationRowModel().rows.length;
  const isServerSidePagination =
    paginationTotal != null &&
    paginationPageIndex != null &&
    onPaginationChange != null;

  if (isServerSidePagination) {
    const pageSize = table.getState().pagination.pageSize;
    const start = paginationPageIndex * pageSize;
    const end =
      Math.min((paginationPageIndex + 1) * pageSize, paginationTotal) - 1;

    return (
      <div {...wrapperAttributes}>
        {tableFooterExtraButtons}
        <PaginationFooter
          start={start}
          end={end}
          total={paginationTotal}
          onPreviousPage={() => onPaginationChange(paginationPageIndex - 1)}
          onNextPage={() => onPaginationChange(paginationPageIndex + 1)}
        />
      </div>
    );
  }

  if (enablePagination) {
    const pagination = table.getState().pagination;

    const start = pagination.pageIndex * pagination.pageSize;
    const end =
      Math.min(
        (pagination.pageIndex + 1) * pagination.pageSize,
        clientSideTotal,
      ) - 1;
    return (
      <div {...wrapperAttributes}>
        {tableFooterExtraButtons}
        <PaginationFooter
          start={start}
          end={end}
          total={clientSideTotal}
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
          {rowsTruncated !== undefined
            ? getRowCountMessage(
                {
                  data: { rows_truncated: rowsTruncated ?? 0 },
                  row_count: clientSideTotal,
                },
                formatNumber,
              )
            : ngettext(
                msgid`${formatNumber(clientSideTotal)} row`,
                `${formatNumber(clientSideTotal)} rows`,
                clientSideTotal,
              )}
        </span>
      </div>
    );
  }
  return null;
};
