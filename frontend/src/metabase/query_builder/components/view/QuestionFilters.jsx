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
  className,
  question,
  expanded,
  onExpand,
  onCollapse,
}) {
  const query = question.query();
  const filters = query.topLevelFilters();
  if (filters.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      <div className="flex flex-wrap align-center mbn1 mrn1">
        <Tooltip tooltip={expanded ? t`Hide filters` : t`Show filters`}>
          <FilterPill
            invert
            icon="filter"
            className="mr1 mb1 cursor-pointer"
            onClick={expanded ? onCollapse : onExpand}
            data-metabase-event={
              expanded
                ? `View Mode; Header Filters Collapse Click`
                : `View Mode; Header Filters Expand Click`
            }
          >
            {expanded ? null : filters.length}
          </FilterPill>
        </Tooltip>
        {expanded &&
          filters.map((filter, index) => (
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
    </div>
  );
}

export function QuestionFilterWidget({
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
  question.query().isEditable() &&
  question.query().topLevelFilters().length > 0 &&
  !question.isObjectDetail();

QuestionFilterWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().isEditable() &&
  !question.isObjectDetail();
