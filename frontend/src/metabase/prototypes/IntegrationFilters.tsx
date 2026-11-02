import { useMemo } from "react";
import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { SummaryInBarDataZone } from "./or-filters/directions/chart-filters/DataViewCanvas";
import { ExpressionBar } from "./or-filters/directions/expression-bar-rows/ExpressionBar";

interface IntegrationFiltersProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

/**
 * The Iteration 4 shape: a summary and the filters on its output (Count ≥ 3)
 * are one bar. Rows first, then the summary filters as darker pills, AND-ed on.
 */
function hasSingleBarShape(query: Lib.Query) {
  const stageCount = Lib.stageCount(query);
  if (stageCount === 1) {
    return true;
  }
  return (
    stageCount === 2 &&
    Lib.aggregations(query, 0).length > 0 &&
    Lib.aggregations(query, 1).length === 0 &&
    Lib.breakouts(query, 1).length === 0
  );
}

export function IntegrationFilters({
  query,
  onChange,
}: IntegrationFiltersProps) {
  if (hasSingleBarShape(query)) {
    return (
      <Stack px="lg" py="sm" data-testid="integration-filters">
        <SummaryInBarDataZone query={query} onChange={onChange} />
      </Stack>
    );
  }
  return <StagedFilters query={query} onChange={onChange} />;
}

/** Queries nested deeper than summary-then-filter keep one labelled bar per stage. */
function StagedFilters({ query, onChange }: IntegrationFiltersProps) {
  const lastStageIndex = Lib.stageCount(query) - 1;
  const hasSummary =
    Lib.aggregations(query, lastStageIndex).length > 0 ||
    Lib.breakouts(query, lastStageIndex).length > 0;
  const editableQuery = useMemo(
    () => (hasSummary ? Lib.appendStage(query) : query),
    [query, hasSummary],
  );

  return (
    <Stack gap="sm" px="lg" py="sm" data-testid="integration-filters">
      {Array.from(
        { length: Lib.stageCount(editableQuery) },
        (_, stageIndex) => (
          <Stack key={stageIndex} gap="xs">
            <Text
              size="sm"
              c="text-secondary"
            >{t`Stage ${stageIndex + 1}`}</Text>
            <ExpressionBar
              query={editableQuery}
              stageIndex={stageIndex}
              rowsFromNesting={2}
              onChange={(nextQuery) => onChange(Lib.dropEmptyStages(nextQuery))}
            />
          </Stack>
        ),
      )}
    </Stack>
  );
}
