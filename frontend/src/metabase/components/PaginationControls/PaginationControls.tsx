import { c, t } from "ttag";

import Button from "metabase/core/components/Button";
import { Group, Text } from "metabase/ui";

const isLastPage = (pageIndex: number, pageSize: number, total: number) =>
  pageIndex === Math.ceil(total / pageSize) - 1;

export type PaginationControlsProps = {
  page: number;
  pageSize: number;
  itemsLength: number;
  total?: number;
  showTotal?: boolean;
  onNextPage?: (() => void) | null;
  onPreviousPage?: (() => void) | null;
};

export const PaginationControls = ({
  page,
  pageSize,
  itemsLength,
  total,
  showTotal = false,
  onNextPage,
  onPreviousPage,
  ...props
}: PaginationControlsProps) => {
  const isSinglePage = total !== undefined && total <= pageSize;

  if (isSinglePage) {
    return null;
  }

  const isPreviousDisabled = page === 0;
  const isNextDisabled =
    total != null ? isLastPage(page, pageSize, total) : !onNextPage;

  return (
    <Group
      align="center"
      fw="bold"
      aria-label="pagination"
      role="navigation"
      {...props}
    >
      <Text span mr="sm">
        {page * pageSize + 1} - {page * pageSize + itemsLength}
        {showTotal && (
          <>
            <Text span c="text-light">
              &nbsp;
              {c(
                "Appears in phrases like '1-10 of 100', referring to a page of results",
              ).t`of`}
              &nbsp;
            </Text>
            <Text span data-testid="pagination-total">
              {total}
            </Text>
          </>
        )}
      </Text>
      <Button
        onlyIcon
        icon="chevronleft"
        onClick={onPreviousPage ?? undefined}
        disabled={isPreviousDisabled}
        data-testid="previous-page-btn"
        aria-label={t`Previous page`}
      />

      <Button
        onlyIcon
        icon="chevronright"
        onClick={onNextPage ?? undefined}
        disabled={isNextDisabled}
        data-testid="next-page-btn"
        aria-label={t`Next page`}
      />
    </Group>
  );
};
