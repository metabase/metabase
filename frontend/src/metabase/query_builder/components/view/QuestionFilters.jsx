/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { MODAL_TYPES } from "metabase/query_builder/constants";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import { color } from "metabase/lib/colors";
import ViewPill from "./ViewPill";

import {
  HeaderButton,
  FilterHeaderContainer,
  FilterHeaderButton,
} from "./ViewHeader.styled";

const FilterPill = props => <ViewPill color={color("filter")} {...props} />;

export default function QuestionFilters({
  className,
  question,
  expanded,
  onExpand,
  onCollapse,
  onQueryChange,
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
            className="text-small mr1 mb1 cursor-pointer"
            onClick={expanded ? onCollapse : onExpand}
            data-metabase-event={
              expanded
                ? `View Mode; Header Filters Collapse Click`
                : `View Mode; Header Filters Expand Click`
            }
            data-testid="filters-visibility-control"
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
                  onRemove={() => onQueryChange(filter.remove().rootQuery())}
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
                  onQueryChange(newFilter.replace().rootQuery())
                }
                className="scroll-y"
              />
            </PopoverWithTrigger>
          ))}
      </div>
    </div>
  );
}

export function FilterHeaderToggle({
  className,
  question,
  onExpand,
  expanded,
  onCollapse,
  onQueryChange,
}) {
  const query = question.query();
  const filters = query.topLevelFilters();
  if (filters.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      <Tooltip tooltip={expanded ? t`Hide filters` : t`Show filters`}>
        <FilterHeaderButton
          small
          rounded
          icon="filter"
          onClick={expanded ? onCollapse : onExpand}
          active={expanded}
          data-testid="filters-visibility-control"
        >
          <span>{filters.length}</span>
        </FilterHeaderButton>
      </Tooltip>
    </div>
  );
}

export function FilterHeader({ question, expanded, onQueryChange }) {
  const query = question.query();
  const filters = query.topLevelFilters();
  if (filters.length === 0 || !expanded) {
    return null;
  }
  return (
    <FilterHeaderContainer data-testid="qb-filters-panel">
      <div className="flex flex-wrap align-center">
        {filters.map((filter, index) => (
          <PopoverWithTrigger
            key={index}
            triggerElement={
              <FilterPill
                onRemove={() => onQueryChange(filter.remove().rootQuery())}
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
                onQueryChange(newFilter.replace().rootQuery())
              }
              className="scroll-y"
            />
          </PopoverWithTrigger>
        ))}
      </div>
    </FilterHeaderContainer>
  );
}

export function QuestionFilterWidget({ onOpenModal, className }) {
  return (
    <HeaderButton
      large
      labelBreakpoint="sm"
      className={className}
      color={color("filter")}
      onClick={() => onOpenModal(MODAL_TYPES.FILTERS)}
      aria-label={t`Show more filters`}
      data-metabase-event="View Mode; Open Filter Modal"
    >
      {t`Filter`}
    </HeaderButton>
  );
}

QuestionFilters.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
}) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().isEditable() &&
  question.query().topLevelFilters().length > 0 &&
  !isObjectDetail;

QuestionFilterWidget.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().isEditable() &&
  !isObjectDetail &&
  isActionListVisible;
