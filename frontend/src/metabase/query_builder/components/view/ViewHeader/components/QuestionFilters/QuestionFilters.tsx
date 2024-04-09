import { FilterPanel, FilterPanelButton } from "metabase/querying";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

interface FilterHeaderToggleProps {
  className?: string;
  query: Lib.Query;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FilterHeaderToggle({
  className,
  query,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterHeaderToggleProps) {
  return (
    <div className={className}>
      <FilterPanelButton
        query={query}
        isExpanded={isExpanded}
        onExpand={onExpand}
        onCollapse={onCollapse}
      />
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
  const query = question.query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
  };

  if (!expanded) {
    return null;
  }

  return <FilterPanel query={query} onChange={handleChange} />;
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
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" && !isNative && isEditable && !isObjectDetail
  );
};

FilterHeader.shouldRender = shouldRender;
FilterHeaderToggle.shouldRender = shouldRender;
