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
  <ViewButton
    medium
    icon="filter"
    color={color("filter")}
    labelBreakpoint="sm"
    {...props}
  />
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
    <div className="flex flex-wrap align-center mbn1">
      <Tooltip tooltip={t`Hide filters`}>
        <FilterPill
          invert
          icon="filter"
          className="mr1 mb1"
          onClick={onCollapse}
        />
      </Tooltip>
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
          triggerClasses="flex flex-no-shrink align-center mr1 mb1"
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
    <Tooltip tooltip={t`Show filters`}>
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
  question.query().topLevelFilters().length > 0 &&
  !question.isObjectDetail();

QuestionFilterWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().table() &&
  !question.isObjectDetail();
