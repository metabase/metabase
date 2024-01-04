import { t } from "ttag";

import { Tooltip } from "metabase/ui";
import { FilterBar } from "metabase/querying/components/FilterBar";

import type { QueryBuilderMode } from "metabase-types/store";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";
import { FilterHeaderButton } from "./QuestionFilters.styled";

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
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
}

export function FilterHeader({
  question,
  expanded,
  updateQuestion,
}: FilterHeaderProps) {
  const query = question._getMLv2Query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question._setMLv2Query(query), { run: true });
  };

  if (!expanded) {
    return null;
  }

  return <FilterBar query={query} onChange={handleChange} />;
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
  question.isQueryEditable() &&
  (question.query() as LegacyQuery).topLevelFilters().length > 0 &&
  !isObjectDetail;

FilterHeader.shouldRender = shouldRender;
FilterHeaderToggle.shouldRender = shouldRender;
