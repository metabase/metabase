import React from "react";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const QuestionFilters = ({
  question,
  expanded,
  onOpenAddFilter,
  onOpenEditFilter,
  onCloseFilter,
  onExpand,
}) => {
  const filters = question.query().filters();
  return filters.length === 0 ? (
    <FilterContainer>
      <Button medium icon="filter" onClick={onOpenAddFilter}>
        {`Filter`}
      </Button>
    </FilterContainer>
  ) : expanded ? (
    <FilterContainer>
      {filters.map((filter, index) => (
        <Button
          medium
          key={index}
          purple
          mr={1}
          onClick={() => onOpenEditFilter(index)}
        >
          {filter.displayName()}
          <Icon
            name="close"
            className="text-light text-medium-hover cursor-pointer ml1"
            size={12}
            onClick={e => {
              e.stopPropagation(); // prevent parent button from triggering
              filter.remove().update();
              onCloseFilter();
            }}
          />
        </Button>
      ))}
      <Button medium icon="add" onClick={onOpenAddFilter} />
    </FilterContainer>
  ) : (
    <FilterContainer>
      <Button medium icon="filter" purple onClick={onExpand}>
        {`${filters.length} filters`}
      </Button>
    </FilterContainer>
  );
};

QuestionFilters.shouldRender = ({ question }) =>
  question && question.query() instanceof StructuredQuery;

export const questionHasFilters = question =>
  question &&
  question.query() instanceof StructuredQuery &&
  question.query().filters().length > 0;

const FilterContainer = ({ children }) => (
  <div className="flex align-stretch scroll-x">{children}</div>
);

export default QuestionFilters;
