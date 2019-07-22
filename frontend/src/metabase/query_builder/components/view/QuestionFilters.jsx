import React from "react";

import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import ViewPill from "./ViewPill";
import ViewButton from "./ViewButton";

import { color } from "metabase/lib/colors";

const FilterPill = props => <ViewPill color={color("filter")} {...props} />;

const FilterButton = props => (
  <ViewButton medium icon="filter" color={color("filter")} {...props} />
);

export default function QuestionFilters({
  question,
  expanded,
  onExpand,
  onCollapse,
}) {
  const query = question.query();
  const filters = query.topLevelFilters();
  return filters.length === 0 ? null : expanded ? (
    <div className="flex align-center">
      <FilterPill invert icon="filter" className="mr1" onClick={onCollapse} />
      {filters.map((filter, index) => (
        <PopoverWithTrigger
          key={index}
          triggerElement={
            <FilterPill
              onRemove={() => filter.remove().update(null, { run: true })}
            >
              {filter.displayName()}
            </FilterPill>
          }
          triggerClasses="flex align-center mr1"
          sizeToFit
        >
          <FilterPopover
            isTopLevel
            query={query}
            filter={filter}
            onChangeFilter={newFilter =>
              newFilter.replace().update(null, { run: true })
            }
            className="scroll-y"
          />
        </PopoverWithTrigger>
      ))}
    </div>
  ) : (
    <Tooltip tooltip={`Show filters`}>
      <FilterPill invert icon="filter" onClick={onExpand}>
        {filters.length}
      </FilterPill>
    </Tooltip>
  );
}

export function QuestionFilterWidget({
  query,
  isShowingFilterSidebar,
  onAddFilter,
  onCloseFilter,
  ...props
}) {
  return (
    <FilterButton
      onClick={isShowingFilterSidebar ? onCloseFilter : onAddFilter}
      active={isShowingFilterSidebar}
      {...props}
    >
      {t`Filter`}
    </FilterButton>
  );
}

QuestionFilters.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().topLevelFilters().length > 0;

QuestionFilterWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().table();
