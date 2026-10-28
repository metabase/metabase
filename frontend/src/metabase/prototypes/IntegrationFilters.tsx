import { useMemo } from "react";
import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionBar } from "./or-filters/directions/expression-bar-2/ExpressionBar";

interface IntegrationFiltersProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

export function IntegrationFilters({
  query,
  onChange,
}: IntegrationFiltersProps) {
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
              onChange={(nextQuery) => onChange(Lib.dropEmptyStages(nextQuery))}
              hasInlineActions
            />
          </Stack>
        ),
      )}
    </Stack>
  );
}
