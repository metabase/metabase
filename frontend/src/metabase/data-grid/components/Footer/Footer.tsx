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
  const wrapperAttributes = {
    "data-testid": "table-footer",
    className: S.root,
    style: { height: `${FOOTER_HEIGHT}px` },
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
        <span className={S.rowsCount}>{t`${total} rows`}</span>
      </div>
    );
  }
  return null;
};
