import cx from "classnames";
import type { MouseEvent, ReactNode } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { Icon } from "metabase/ui";

import S from "./PaginationFooter.module.css";

interface PaginationFooterProps {
  className?: string;
  "data-testid"?: string;
  start: number;
  end: number;
  total: number;
  message: ReactNode;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export const PaginationFooter = forwardRef<
  HTMLDivElement,
  PaginationFooterProps
>(function PaginationFooter(
  {
    className,
    "data-testid": dataTestId = "pagination-footer",
    start,
    end,
    total,
    message,
    onPreviousPage,
    onNextPage,
  }: PaginationFooterProps,
  ref,
) {
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
    <div
      className={cx(S.root, DashboardS.fullscreenNormalText, className)}
      data-testid={dataTestId}
      ref={ref}
    >
      <span className={S.message}>{message}</span>
      <button
        className={cx(S.button, S.previous)}
        aria-label={t`Previous page`}
        onClick={handlePreviousPage}
        disabled={start === 0}
      >
        <Icon name="chevronleft" />
      </button>
      <button
        className={S.button}
        aria-label={t`Next page`}
        onClick={handleNextPage}
        disabled={end + 1 >= total}
      >
        <Icon name="chevronright" />
      </button>
    </div>
  );
});
