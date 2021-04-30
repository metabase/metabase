import React from "react";
import PropTypes from "prop-types";

import colors from "metabase/lib/colors";
import Icon, { IconWrapper } from "metabase/components/Icon";

export default function PaginationControls({
  page,
  pageSize,
  itemsLength,
  onNextPage,
  onPreviousPage,
}) {
  return (
    <div className="flex align-center" aria-label="pagination">
      <span className="text-bold mr1">
        {page * pageSize + 1} - {page * pageSize + itemsLength}
      </span>
      <PaginationButton
        onClick={onPreviousPage}
        disabled={!onPreviousPage}
        data-testid="previous-page-btn"
      >
        <Icon name="chevronleft" />
      </PaginationButton>
      <PaginationButton
        small
        onClick={onNextPage}
        disabled={!onNextPage}
        data-testid="next-page-btn"
      >
        <Icon name="chevronright" />
      </PaginationButton>
    </div>
  );
}

const PaginationButton = IconWrapper.withComponent("button").extend`
  &:disabled {
    background-color: ${colors["white"]};
    color: ${colors["text-light"]};
  }
`;

PaginationControls.propTypes = {
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  itemsLength: PropTypes.number.isRequired,
  onNextPage: PropTypes.func,
  onPreviousPage: PropTypes.func,
};
