import React from "react";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ViewFilterPopover from "metabase/query_builder/components/view/ViewFilterPopover";

const QuestionFilters = ({ question, expanded, onExpand }) => {
  const query = question.query();
  const filters = query.topLevelFilters();
  return filters.length === 0 ? (
    <PopoverWithTrigger
      triggerElement={
        <Button medium icon="filter" color="#7172AD">
          {`Filter`}
        </Button>
      }
      sizeToFit
    >
      <ViewFilterPopover
        query={query}
        onChangeFilter={newFilter =>
          newFilter.add().update(null, { run: true })
        }
      />
    </PopoverWithTrigger>
  ) : expanded ? (
    <FilterContainer>
      {filters.map((filter, index) => (
        <PopoverWithTrigger
          triggerElement={
            <Button borderless key={index} mr={1} className="text-purple">
              {filter.displayName()}
              <Icon
                name="close"
                ml={1}
                size={12}
                onClick={e => {
                  e.stopPropagation(); // prevent parent button from triggering
                  filter.remove().update(null, { run: true });
                }}
              />
            </Button>
          }
          sizeToFit
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
      <PopoverWithTrigger
        triggerElement={<Button medium icon="add" color="#7172AD" />}
        sizeToFit
      >
        <ViewFilterPopover
          query={query}
          onChangeFilter={newFilter =>
            newFilter.add().update(null, { run: true })
          }
        />
      </PopoverWithTrigger>
    </FilterContainer>
  ) : (
    <Button medium icon="filter" purple onClick={onExpand}>
      {`${filters.length} filters`}
    </Button>
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
  <div style={{ width: 0, minWidth: "100%", whiteSpace: "nowrap" }}>
    {children}
  </div>
);

export default QuestionFilters;
