import { c, t } from "ttag";
import Button from "metabase/core/components/Button";
import { Group, Text, Select } from "metabase/ui";
import React from "react";

const isLastPage = (pageIndex: number, pageSize: number, total: number) =>
  pageIndex === Math.ceil(total / pageSize) - 1;

const getPageNumbers = (currentPage: any, totalPages: any) => {
  const delta = 2; // Number of pages to show before and after the current page
  const range = [];
  for (
    let i = Math.max(2, currentPage - delta);
    i <= Math.min(totalPages - 1, currentPage + delta);
    i++
  ) {
    range.push(i);
  }
  if (currentPage - delta > 2) {
    range.unshift("...");
  }
  if (currentPage + delta < totalPages - 1) {
    range.push("...");
  }
  range.unshift(1);
  if (totalPages > 1) {
    range.push(totalPages);
  }
  return range;
};

export type PaginationControlsCustomProps = {
  page: number;
  pageSize: number;
  itemsLength: number;
  total?: number;
  showTotal?: boolean;
  onNextPage?: (() => void) | null;
  onPreviousPage?: (() => void) | null;
  showItemsPerPage?: boolean;
  onItemsPerPageChange?: (newPageSize: number) => void;
  onPageChange?: (newPage: number) => void;
};

export const PaginationControlsCustom = ({
  page,
  pageSize,
  itemsLength,
  total,
  showTotal = false,
  onNextPage,
  onPreviousPage,
  showItemsPerPage = false,
  onItemsPerPageChange,
  onPageChange,
  ...props
}: PaginationControlsCustomProps) => {
  const isPreviousDisabled = page === 0;
  const isNextDisabled =
    total != null ? isLastPage(page, pageSize, total) : !onNextPage;
  const totalPages = total ? Math.ceil(total / pageSize) : 1;

  const handleItemsPerPageChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    if (onItemsPerPageChange) {
      onItemsPerPageChange(Number(event.target.value));
    }
  };

  const handlePageChange = (newPage: number) => {
    if (onPageChange && newPage !== page) {
      onPageChange(newPage);
    }
  };

  const pageNumbers = getPageNumbers(page + 1, totalPages);

  return (
    <Group
      position="apart"
      align="center"
      fw="bold"
      color="#8F9296"
      aria-label="pagination"
      role="navigation"
      {...props}
      style={{ width: "100%", padding: "0rem 1rem" }}
    >
      <Group align="center" style={{ gap: 0 }}>
        {showItemsPerPage && (
          <>
            <Text span mr="sm" color="#8F9296" style={{ fontWeight: "400" }}>
              {t`Results per page:`}
            </Text>
            <select
              value={pageSize}
              onChange={handleItemsPerPageChange}
              aria-label={t`Results per page`}
              style={{
                marginRight: "0.5rem",
                border: "1px solid #d3d3d3",
                borderRadius: "4px",
                padding: "0.25rem 0.5rem",
                minWidth: "60px",
                color: "#8F9296",
              }}
            >
              {[10, 20, 30, 50, 100].map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            {total && (
              <Text span color="#8F9296" style={{ fontWeight: "400" }}>
                {t`of`} {total}
              </Text>
            )}
          </>
        )}
      </Group>
      <Group align="center" style={{ gap: 0 }}>
        <Button
          onlyIcon
          icon="chevronleft"
          onClick={onPreviousPage ?? undefined}
          disabled={isPreviousDisabled}
          data-testid="previous-page-btn"
          aria-label={t`Previous page`}
          style={{
            border: "none",
            cursor: isPreviousDisabled ? "not-allowed" : "pointer",
            margin: "0 0.5rem",
            padding: "0.5rem",
            borderRadius: "4px",
            color: "#8F9296",
          }}
        />

        {pageNumbers.map((pageNumber, index) =>
          typeof pageNumber === "number" ? (
            <Button
              key={index}
              onClick={() => handlePageChange(pageNumber - 1)}
              style={{
                backgroundColor:
                  page === pageNumber - 1 ? "#D5E3C3" : "transparent",
                color: page === pageNumber - 1 ? "#587330" : "#8F9296",
                border: "none",
                margin: "0 4px",
                padding: "0.25rem 0.75rem",
                cursor: "pointer",
                borderRadius: "4px",
                fontWeight: "400",
              }}
            >
              {pageNumber}
            </Button>
          ) : (
            <Text key={index} span color="#8F9296" style={{ margin: "0 4px" }}>
              {pageNumber}
            </Text>
          ),
        )}

        <Button
          onlyIcon
          icon="chevronright"
          onClick={onNextPage ?? undefined}
          disabled={isNextDisabled}
          data-testid="next-page-btn"
          aria-label={t`Next page`}
          style={{
            border: "none",
            cursor: isNextDisabled ? "not-allowed" : "pointer",
            padding: "0.5rem",
            borderRadius: "4px",
            color: "#8F9296",
          }}
        />
      </Group>
    </Group>
  );
};
