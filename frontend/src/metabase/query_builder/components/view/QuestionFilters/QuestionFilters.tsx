import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { FilterPopover } from "metabase/query_builder/components/filters/FilterPopover";

import { color } from "metabase/lib/colors";

import type { QueryBuilderMode } from "metabase-types/store";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import ViewPill from "../ViewPill";
import type { ViewPillProps } from "../ViewPill";
import {
  FilterHeaderContainer,
  FilterHeaderButton,
} from "./QuestionFilters.styled";

const FilterPill = (props: ViewPillProps) => (
  <ViewPill color={color("filter")} {...props} />
);

interface FilterHeaderToggleProps {
  className?: string;
  question: Question;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FilterHeaderToggle({
  className,
  question,
  expanded,
  onExpand,
  onCollapse,
}: FilterHeaderToggleProps) {
  const query = question.query() as StructuredQuery;
  const filters = query.topLevelFilters();
  return (
    <div className={className}>
      <Tooltip tooltip={expanded ? t`Hide filters` : t`Show filters`}>
        <FilterHeaderButton
          small
          icon="filter"
          onClick={expanded ? onCollapse : onExpand}
          active={expanded}
          data-metabase-event={
            expanded
              ? `View Mode; Header Filters Collapse Click`
              : `View Mode; Header Filters Expand Click`
          }
          data-testid="filters-visibility-control"
        >
          <span>{filters.length}</span>
        </FilterHeaderButton>
      </Tooltip>
    </div>
  );
}

interface FilterHeaderProps {
  question: Question;
  expanded: boolean;
  onQueryChange: (query: StructuredQuery) => void;
}

export function FilterHeader({
  question,
  expanded,
  onQueryChange,
}: FilterHeaderProps) {
  const query = question.query() as StructuredQuery;
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

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
};

const shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
}: RenderCheckOpts) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().isEditable() &&
  (question.query() as StructuredQuery).topLevelFilters().length > 0 &&
  !isObjectDetail;

FilterHeader.shouldRender = shouldRender;
FilterHeaderToggle.shouldRender = shouldRender;
