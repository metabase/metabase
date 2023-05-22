import React, { MouseEvent, useCallback, useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";

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

const TableFooter = React.forwardRef<HTMLDivElement, TableFooterProps>(
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
          "fullscreen-normal-text fullscreen-night-text",
        )}
        data-testid={dataTestId}
        ref={ref}
      >
        <PaginationMessage>{paginateMessage}</PaginationMessage>
        <PaginationButton
          direction="previous"
          onClick={handlePreviousPage}
          disabled={start === 0}
        >
          <Icon name="chevronleft" />
        </PaginationButton>
        <PaginationButton
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

export default TableFooter;
