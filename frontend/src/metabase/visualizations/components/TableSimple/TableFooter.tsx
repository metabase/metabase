import cx from "classnames";
import type { MouseEvent } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Icon } from "metabase/ui";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import {
  TableFooterRoot,
  PaginationMessage,
  PaginationButton,
} from "./TableSimple.styled";

interface TableFooterProps {
  className?: string;
  "data-testid"?: string;
  start: number;
  end: number;
  total: number;
  limit?: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  singleItem?: boolean;
}

const TableFooter = forwardRef<HTMLDivElement, TableFooterProps>(
  function TableFooter(
    {
      className,
      "data-testid": dataTestId = "TableFooter",
      start,
      end,
      limit,
      total,
      onPreviousPage,
      onNextPage,
      singleItem,
    }: TableFooterProps,
    ref,
  ) {
    const paginateMessage = useMemo(() => {
      const isOverLimit = limit === undefined && total >= HARD_ROW_LIMIT;

      if (singleItem) {
        return isOverLimit
          ? t`Item ${start + 1} of first ${total}`
          : t`Item ${start + 1} of ${total}`;
      }

      return isOverLimit
        ? t`Rows ${start + 1}-${end + 1} of first ${total}`
        : t`Rows ${start + 1}-${end + 1} of ${total}`;
    }, [total, start, end, limit, singleItem]);

    const handlePreviousPage = useCallback(
      (event: MouseEvent) => {
        event.preventDefault();
        onPreviousPage();
      },
      [onPreviousPage],
    );

    const handleNextPage = useCallback(
      (event: MouseEvent) => {
        event.preventDefault();
        onNextPage();
      },
      [onNextPage],
    );

    return (
      <TableFooterRoot
        className={cx(
          className,
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
        data-testid={dataTestId}
        ref={ref}
      >
        <PaginationMessage>{paginateMessage}</PaginationMessage>
        <PaginationButton
          aria-label={t`Previous page`}
          direction="previous"
          onClick={handlePreviousPage}
          disabled={start === 0}
        >
          <Icon name="chevronleft" />
        </PaginationButton>
        <PaginationButton
          aria-label={t`Next page`}
          direction="next"
          onClick={handleNextPage}
          disabled={end + 1 >= total}
        >
          <Icon name="chevronright" />
        </PaginationButton>
      </TableFooterRoot>
    );
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableFooter;
