import type { Table } from "@tanstack/react-table";
import { t } from "ttag";

import { FOOTER_HEIGHT } from "metabase/data-grid/constants";
import { PaginationFooter } from "metabase/visualizations/components/PaginationFooter/PaginationFooter";

import S from "./Footer.module.css";

export interface FooterProps<TData> {
  table: Table<TData>;
  enablePagination?: boolean;
  showRowsCount?: boolean;
}

export const Footer = <TData,>({
  table,
  showRowsCount,
  enablePagination,
}: FooterProps<TData>) => {
  if (!enablePagination && !showRowsCount) {
    return null;
  }

  if (enablePagination) {
    const pagination = table.getState().pagination;

    const total = table.getPrePaginationRowModel().rows.length;
    const start = pagination.pageIndex * pagination.pageSize;
    const end =
      Math.min((pagination.pageIndex + 1) * pagination.pageSize, total) - 1;
    return (
      <div className={S.root} style={{ height: `${FOOTER_HEIGHT}px` }}>
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
    const rowsCount = table.getPrePaginationRowModel().rows.length;
    return (
      <div className={S.root} style={{ height: `${FOOTER_HEIGHT}px` }}>
        <span className={S.rowsCount}>{t`${rowsCount} rows`}</span>
      </div>
    );
  }
  return null;
};
