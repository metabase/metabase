import { t } from "ttag";

import { Flex, Tooltip } from "metabase/ui";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { FilterPopover } from "metabase/query_builder/components/filters/FilterPopover";

import { color } from "metabase/lib/colors";

import type { QueryBuilderMode } from "metabase-types/store";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Filter from "metabase-lib/queries/structured/Filter";

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
      <Tooltip label={expanded ? t`Hide filters` : t`Show filters`}>
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
      <Flex align="center" wrap="wrap">
        {filters.map((filter, index) => (
          <FilterHeaderPopover
            key={index}
            query={query}
            filter={filter}
            onQueryChange={onQueryChange}
          />
        ))}
      </Flex>
    </FilterHeaderContainer>
  );
}

interface FilterHeaderPopoverProps {
  query: StructuredQuery;
  filter: Filter;
  onQueryChange: (query: StructuredQuery) => void;
}

function FilterHeaderPopover({
  query,
  filter,
  onQueryChange,
}: FilterHeaderPopoverProps) {
  const handleChange = (newFilter: Filter) => {
    onQueryChange(newFilter.replace().rootQuery());
  };

  const handleRemove = () => {
    onQueryChange(filter.remove().rootQuery());
  };

  return (
    <PopoverWithTrigger
      triggerElement={
        <FilterPill onRemove={handleRemove}>{filter.displayName()}</FilterPill>
      }
      triggerClasses="flex flex-no-shrink align-center mr1 mb1"
      sizeToFit
    >
      <FilterPopover
        className="scroll-y"
        query={query}
        filter={filter}
        isTopLevel
        onChangeFilter={handleChange}
      />
    </PopoverWithTrigger>
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
