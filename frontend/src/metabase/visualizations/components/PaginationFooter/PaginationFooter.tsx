import cx from "classnames";
import type { MouseEvent } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Icon } from "metabase/ui";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import {
  PaginationButton,
  PaginationFooterRoot,
  PaginationMessage,
} from "./PaginationFooter.styled";

interface PaginationFooterProps {
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

export const PaginationFooter = forwardRef<
  HTMLDivElement,
  PaginationFooterProps
>(function ObjectDetailFooter(
  {
    className,
    "data-testid": dataTestId = "ObjectDetailFooter",
    start,
    end,
    limit,
    total,
    onPreviousPage,
    onNextPage,
    singleItem,
  }: PaginationFooterProps,
  ref,
) {
  const formatNumber = useNumberFormatter();
  const paginateMessage = useMemo(() => {
    const isOverLimit = limit === undefined && total >= HARD_ROW_LIMIT;

    if (singleItem) {
      return isOverLimit
        ? t`Item ${start + 1} of first ${total}`
        : t`Item ${start + 1} of ${total}`;
    }

    return isOverLimit
      ? t`Rows ${start + 1}-${end + 1} of first ${formatNumber(total)}`
      : t`Rows ${start + 1}-${end + 1} of ${formatNumber(total)}`;
  }, [total, start, end, limit, singleItem, formatNumber]);

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
    <PaginationFooterRoot
      className={cx(className, DashboardS.fullscreenNormalText)}
      data-testid={dataTestId}
      ref={ref}
    >
      <PaginationMessage>{paginateMessage}</PaginationMessage>
      <PaginationButton
        className={CS.textPrimary}
        aria-label={t`Previous page`}
        direction="previous"
        onClick={handlePreviousPage}
        disabled={start === 0}
      >
        <Icon name="chevronleft" />
      </PaginationButton>
      <PaginationButton
        className={CS.textPrimary}
        aria-label={t`Next page`}
        direction="next"
        onClick={handleNextPage}
        disabled={end + 1 >= total}
      >
        <Icon name="chevronright" />
      </PaginationButton>
    </PaginationFooterRoot>
  );
});
