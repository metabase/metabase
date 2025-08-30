import type { Table } from "@tanstack/react-table";
import cx from "classnames";
import { msgid, ngettext } from "ttag";

import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { FOOTER_HEIGHT } from "metabase/data-grid/constants";
import { PaginationFooter } from "metabase/visualizations/components/PaginationFooter/PaginationFooter";

import S from "./Footer.module.css";

export interface FooterProps<TData> {
  table: Table<TData>;
  enablePagination?: boolean;
  showRowsCount?: boolean;
  style?: React.CSSProperties;
  className?: string;
  tableFooterExtraButtons?: React.ReactNode;
}

export const Footer = <TData,>({
  table,
  showRowsCount,
  enablePagination,
  className,
  style,
  tableFooterExtraButtons,
}: FooterProps<TData>) => {
  const formatNumber = useNumberFormatter();
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
        {tableFooterExtraButtons}
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
        {tableFooterExtraButtons}
        <span className={S.rowsCount}>
          {ngettext(
            msgid`${formatNumber(total)} row`,
            `${formatNumber(total)} rows`,
            total,
          )}
        </span>
      </div>
    );
  }
  return null;
};
