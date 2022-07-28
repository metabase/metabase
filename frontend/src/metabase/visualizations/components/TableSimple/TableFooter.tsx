import React, { MouseEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { HARD_ROW_LIMIT } from "metabase/lib/query";

import {
  TableFooterRoot,
  PaginationMessage,
  PaginationButton,
} from "./TableSimple.styled";

interface TableFooterProps {
  start: number;
  end: number;
  total: number;
  limit?: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

const TableFooter = React.forwardRef<HTMLDivElement, TableFooterProps>(
  function TableFooter(
    { start, end, limit, total, onPreviousPage, onNextPage }: TableFooterProps,
    ref,
  ) {
    const paginateMessage = useMemo(() => {
      if (limit === undefined && total >= HARD_ROW_LIMIT) {
        return t`Rows ${start + 1}-${end + 1} of first ${total}`;
      }
      return t`Rows ${start + 1}-${end + 1} of ${total}`;
    }, [total, start, end, limit]);

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
        className="fullscreen-normal-text fullscreen-night-text"
        ref={ref}
      >
        <PaginationMessage>{paginateMessage}</PaginationMessage>
        <PaginationButton
          direction="previous"
          onClick={handlePreviousPage}
          disabled={start === 0}
        >
          <Icon name="triangle_left" size={10} />
        </PaginationButton>
        <PaginationButton
          direction="next"
          onClick={handleNextPage}
          disabled={end + 1 >= total}
        >
          <Icon name="triangle_right" size={10} />
        </PaginationButton>
      </TableFooterRoot>
    );
  },
);

export default TableFooter;
