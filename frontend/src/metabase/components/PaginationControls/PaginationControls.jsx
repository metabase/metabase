import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import { IconWrapper } from "metabase/components/Icon";

export default function PaginationControls({
  page,
  pageSize,
  itemsLength,
  total,
  showTotal,
  onNextPage,
  onPreviousPage,
}) {
  const isSinglePage = total !== undefined && total <= pageSize;

  if (isSinglePage) {
    return null;
  }

  const isPreviousDisabled = page === 0;
  const isNextDisabled =
    total != null ? isLastPage(page, pageSize, total) : !onNextPage;

  return (
    <div className="flex align-center text-bold" aria-label="pagination">
      <span className="mr1">
        {page * pageSize + 1} - {page * pageSize + itemsLength}
        {showTotal && (
          <React.Fragment>
            <span className="text-light">&nbsp;{t`of`}&nbsp;</span>
            <span data-testid="pagination-total">{total}</span>
          </React.Fragment>
        )}
      </span>
      <PaginationButton
        onClick={onPreviousPage}
        disabled={isPreviousDisabled}
        data-testid="previous-page-btn"
      >
        <Icon name="chevronleft" />
      </PaginationButton>
      <PaginationButton
        small
        onClick={onNextPage}
        disabled={isNextDisabled}
        data-testid="next-page-btn"
      >
        <Icon name="chevronright" />
      </PaginationButton>
    </div>
  );
}

const PaginationButton = styled(IconWrapper.withComponent("button"))`
  &:disabled {
    background-color: transparent;
    color: ${color("text-light")};
  }
`;

PaginationControls.propTypes = {
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  itemsLength: PropTypes.number.isRequired,
  total: PropTypes.number,
  showTotal: PropTypes.bool,
  onNextPage: PropTypes.func,
  onPreviousPage: PropTypes.func,
};

PaginationControls.defaultProps = {
  showTotal: false,
};

export const isLastPage = (pageIndex, pageSize, total) =>
  pageIndex === Math.ceil(total / pageSize) - 1;
