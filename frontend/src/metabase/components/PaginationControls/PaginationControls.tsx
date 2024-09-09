import { c, t } from "ttag";
import Button from "metabase/core/components/Button";
import { Group, Text } from "metabase/ui";
import React from "react";

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
  showItemsPerPage?: boolean;
  onItemsPerPageChange?: (newPageSize: number) => void;
};

export const PaginationControls = ({
  page,
  pageSize,
  itemsLength,
  total,
  showTotal = false,
  onNextPage,
  onPreviousPage,
  showItemsPerPage = false,
  onItemsPerPageChange,
  ...props
}: PaginationControlsProps) => {
  const isPreviousDisabled = page === 0;
  const isNextDisabled =
    total != null ? isLastPage(page, pageSize, total) : !onNextPage;

  const handleItemsPerPageChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    if (onItemsPerPageChange) {
      onItemsPerPageChange(Number(event.target.value));
    }
  };

  return (
    <Group
      position="apart"
      align="center"
      fw="bold"
      aria-label="pagination"
      role="navigation"
      {...props}
      style={{ width: "100%", padding: "0rem 1rem" }}
    >
      <Group align="center">
        {showItemsPerPage && (
          <>
            <Text span mr="sm">
              {t`Results per page:`}
            </Text>
            <select
              value={pageSize}
              onChange={handleItemsPerPageChange}
              aria-label={t`Results per page`}
            >
              {[10, 20, 30, 50, 100].map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <Text span mr="sm">
              of {total}
            </Text>
          </>
        )}
      </Group>
      <Group align="center">
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
    </Group>
  );
};
