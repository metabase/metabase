import { t } from "ttag";

import { Flex, Popover, Tooltip } from "metabase/ui";
import { FilterPicker } from "metabase/querying";

import { color } from "metabase/lib/colors";
import { useToggle } from "metabase/hooks/use-toggle";

import type { QueryBuilderMode } from "metabase-types/store";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";
import type LegacyFilter from "metabase-lib/queries/structured/Filter";

import ViewPill from "../ViewPill";
import type { ViewPillProps } from "../ViewPill";
import {
  FilterHeaderContainer,
  FilterHeaderButton,
} from "./QuestionFilters.styled";

const NO_TRANSITION = { duration: 0 };

const FilterPill = (props: ViewPillProps) => (
  <ViewPill
    color={color("filter")}
    {...props}
    data-testid="filter-pill"
    removeButtonLabel={t`Remove`}
  />
);

interface FilterHeaderToggleProps {
  className?: string;
  query: Lib.Query;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FilterHeaderToggle({
  className,
  query,
  expanded,
  onExpand,
  onCollapse,
}: FilterHeaderToggleProps) {
  const stageCount = Lib.stageCount(query);
  const lastStageIndex = stageCount - 1;

  const lastStageFilters = Lib.filters(query, lastStageIndex);
  const previousStageFilters =
    stageCount > 1 ? Lib.filters(query, lastStageIndex - 1) : [];
  const filters = [...previousStageFilters, ...lastStageFilters];

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
  onQueryChange: (query: LegacyQuery) => void;
}

export function FilterHeader({
  question,
  expanded,
  onQueryChange,
}: FilterHeaderProps) {
  const query = question._getMLv2Query();
  const legacyQuery = question.query() as LegacyQuery;

  const stageCount = Lib.stageCount(query);
  const lastStageIndex = stageCount - 1;

  const lastStageFilters = Lib.filters(query, lastStageIndex);
  const previousStageFilters =
    stageCount > 1 ? Lib.filters(query, lastStageIndex - 1) : [];
  const filters = [...previousStageFilters, ...lastStageFilters];

  const handleQueryChange = (nextQuery: Lib.Query) => {
    const nextQuestion = question.setDatasetQuery(Lib.toLegacyQuery(nextQuery));
    onQueryChange(nextQuestion.query() as LegacyQuery);
  };

  if (filters.length === 0 || !expanded) {
    return null;
  }

  return (
    <FilterHeaderContainer data-testid="qb-filters-panel">
      <Flex align="center" wrap="wrap" gap="sm" pb="sm">
        {filters.map((filter, index) => {
          const isLastStage = index >= previousStageFilters.length;
          const stageIndex = isLastStage ? lastStageIndex : lastStageIndex - 1;
          const legacyStagedQuery = legacyQuery.queries()[stageIndex];
          const legacyFilter = legacyStagedQuery.filters()[index];
          return (
            <FilterHeaderPopover
              key={index}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              legacyFilter={legacyFilter}
              legacyQuery={legacyQuery}
              onQueryChange={handleQueryChange}
              onLegacyQueryChange={onQueryChange}
            />
          );
        })}
      </Flex>
    </FilterHeaderContainer>
  );
}

interface FilterHeaderPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  legacyQuery: LegacyQuery;
  legacyFilter: LegacyFilter;
  onQueryChange: (query: Lib.Query) => void;
  onLegacyQueryChange: (query: LegacyQuery) => void;
}

function FilterHeaderPopover({
  query,
  stageIndex,
  filter,
  legacyQuery,
  legacyFilter,
  onQueryChange,
  onLegacyQueryChange,
}: FilterHeaderPopoverProps) {
  const [isOpen, { turnOff: handleClose, toggle: handleToggle }] =
    useToggle(false);

  const handleChange = (
    newFilter: Lib.ExpressionClause | Lib.SegmentMetadata,
  ) => {
    const nextQuery = Lib.replaceClause(query, stageIndex, filter, newFilter);
    onQueryChange(nextQuery);
  };

  const handleChangeLegacy = (newFilter: LegacyFilter) => {
    const nextLegacyQuery = newFilter.replace().rootQuery();
    onLegacyQueryChange(nextLegacyQuery);
  };

  const handleRemove = () => {
    const nextQuery = Lib.removeClause(query, stageIndex, filter);
    onQueryChange(nextQuery);
  };

  const filterInfo = Lib.displayInfo(query, stageIndex, filter);

  return (
    <Popover
      opened={isOpen}
      trapFocus
      transitionProps={NO_TRANSITION}
      position="bottom-start"
      onClose={handleClose}
    >
      <Popover.Target>
        <div>
          <FilterPill onClick={handleToggle} onRemove={handleRemove}>
            {filterInfo.longDisplayName}
          </FilterPill>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          legacyQuery={legacyQuery}
          legacyFilter={legacyFilter}
          onSelect={handleChange}
          onSelectLegacy={handleChangeLegacy}
          onClose={handleClose}
        />
      </Popover.Dropdown>
    </Popover>
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
  (question.query() as LegacyQuery).topLevelFilters().length > 0 &&
  !isObjectDetail;

FilterHeader.shouldRender = shouldRender;
FilterHeaderToggle.shouldRender = shouldRender;
