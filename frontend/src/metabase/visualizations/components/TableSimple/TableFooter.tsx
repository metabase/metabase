import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import { HARD_ROW_LIMIT } from "metabase/lib/query";

import {
  TableFooterRoot,
  PaginationMessage,
  PaginationButton,
} from "./TableSimple.styled";

interface Props {
  className?: string;
  start: number;
  end: number;
  total: number;
  limit?: number;
  handlePreviousPage: () => void;
  handleNextPage: () => void;
}

const TableFooter = React.forwardRef<HTMLDivElement, Props>(
  function TableFooter(
    {
      className,
      start,
      end,
      limit,
      total,
      handlePreviousPage,
      handleNextPage,
    }: Props,
    ref,
  ) {
    const paginateMessage = useMemo(() => {
      if (limit === undefined && total >= HARD_ROW_LIMIT) {
        return t`Rows ${start + 1}-${end + 1} of first ${total}`;
      }
      return t`Rows ${start + 1}-${end + 1} of ${total}`;
    }, [total, start, end, limit]);

    return (
      <TableFooterRoot
        className={cx(
          className,
          "fullscreen-normal-text fullscreen-night-text",
        )}
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
