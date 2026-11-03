import { useMemo } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
// eslint-disable-next-line boundaries/element-types, metabase/enforce-module-public-api -- prototype: the bar moves to querying/filters once it settles
import { ExpressionBar } from "metabase/query_builder/components/view/ViewHeader/components/KeyboardFilterRow/ExpressionBar";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import { memoize } from "metabase/utils/memoize";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";
import { NotebookCell } from "../NotebookCell";

const getAddFilterText = () => t`Add filters to narrow your answer`;

export function FilterStep(props: NotebookStepProps) {
  const { query, step, color, isLastOpened, readOnly, updateQuery } = props;

  if (readOnly) {
    return <ReadOnlyFilterStep {...props} />;
  }

  return (
    <ErrorBoundary>
      <NotebookCell color={color} data-testid="filter-step-expression-bar">
        <ExpressionBar
          query={query}
          stageIndex={step.stageIndex}
          onChange={updateQuery}
          // The notebook never runs the query on its own: every valid
          // expression writes to it, and the user visualizes when ready.
          isAutoApply
          // One stage per step: the chooser has the stage's columns only.
          hasSummaries={false}
          variant="notebook"
          placeholder={getAddFilterText()}
          openKey={isLastOpened ? 0 : null}
        />
      </NotebookCell>
    </ErrorBoundary>
  );
}

function ReadOnlyFilterStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
}: NotebookStepProps) {
  const { stageIndex } = step;
  const tc = useTranslateContent();
  const { locale } = useLocale();

  const filters = useMemo(
    () => Lib.filters(query, stageIndex),
    [query, stageIndex],
  );

  const renderFilterName = useMemo(
    () =>
      memoize((filter: Lib.FilterClause) =>
        getTranslatedFilterDisplayName(query, stageIndex, filter, tc, locale),
      ),
    [query, stageIndex, tc, locale],
  );

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={getAddFilterText()}
        readOnly={readOnly}
        color={color}
        isLastOpened={isLastOpened}
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose }) => (
          <FilterPicker
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={index}
            onSelect={noop}
            onClose={onClose}
            readOnly={readOnly}
          />
        )}
        onRemove={noop}
        onReorder={noop}
      />
    </ErrorBoundary>
  );
}
