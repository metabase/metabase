import React from "react";
import { Flex } from "grid-styled";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ViewFilterPopover from "metabase/query_builder/components/view/ViewFilterPopover";

const QuestionFilters = ({
  question,
  expanded,
  onOpenAddFilter,
  onOpenEditFilter,
  onCloseFilter,
  onExpand,
}) => {
  const query = question.query();
  const filters = query.topLevelFilters();
  return filters.length === 0 ? (
    <FilterContainer>
      <PopoverWithTrigger
        triggerElement={
          <Button medium icon="filter" color="#7172AD">
            {`Filter`}
          </Button>
        }
      >
        <ViewFilterPopover
          query={query}
          onChangeFilter={newFilter =>
            newFilter.add().update(null, { run: true })
          }
        />
      </PopoverWithTrigger>
    </FilterContainer>
  ) : expanded ? (
    <FilterContainer>
      {filters.map((filter, index) => (
        <PopoverWithTrigger
          triggerElement={
            <Button
              medium
              key={index}
              purple
              mr={1}
              onClick={() => onOpenEditFilter(index)}
            >
              <Flex align="center">
                {filter.displayName()}
                <Icon
                  name="close"
                  ml={1}
                  size={12}
                  onClick={e => {
                    e.stopPropagation(); // prevent parent button from triggering
                    filter.remove().update(null, { run: true });
                    onCloseFilter();
                  }}
                />
              </Flex>
            </Button>
          }
        >
          <ViewFilterPopover
            query={query}
            filter={filter}
            onChangeFilter={newFilter =>
              newFilter.replace().update(null, { run: true })
            }
          />
        </PopoverWithTrigger>
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

QuestionFilters.shouldRender = ({ question, queryBuilderMode }) =>
  question &&
  question.query() instanceof StructuredQuery &&
  question.query().table() &&
  // NOTE: remove queryBuilderMode check once legacy query builder is removed
  queryBuilderMode !== "notebook";

export const questionHasFilters = question =>
  question &&
  question.query() instanceof StructuredQuery &&
  question.query().topLevelFilters().length > 0;

const FilterContainer = ({ children }) => (
  <div className="flex align-stretch scroll-x">{children}</div>
);

export default QuestionFilters;
