import { useMemo } from "react";
import { t } from "ttag";

import { Box, Group, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionBar } from "./ExpressionBar";
import S from "./ExpressionBar.module.css";

type StagedExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

/**
 * The expression bar with its trailing segment. Stage `stageIndex` is the
 * expression over the rows; once the stage has a summary, a divider and a
 * second segment follow for the filters on that summary (the next stage).
 * Those can only be AND-ed, since an OR across a summary is not one query.
 */
export function StagedExpressionBar({
  query,
  stageIndex,
  onChange,
}: StagedExpressionBarProps) {
  const summaryStageIndex = stageIndex + 1;
  const hasSummary = Lib.aggregations(query, stageIndex).length > 0;
  const hasSummaryStage = Lib.stageCount(query) > summaryStageIndex;

  // The segment edits the next stage; until one exists it edits a copy with
  // the stage appended, so its first filter creates the stage on apply.
  const summaryQuery = useMemo(
    () => (hasSummaryStage ? query : Lib.appendStage(query)),
    [query, hasSummaryStage],
  );

  const handleSummaryChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  return (
    <Group gap="sm" align="flex-start" w="100%" wrap="nowrap">
      <Box style={{ flex: "1 1 60%", minWidth: 0 }}>
        <ExpressionBar
          query={query}
          stageIndex={stageIndex}
          onChange={onChange}
          hasInlineActions
        />
      </Box>
      {hasSummary && (
        <>
          <Group
            className={S.segmentDivider}
            gap="xs"
            wrap="nowrap"
            title={t`Filters after summarizing apply to the summary rows, so they can only be AND-ed with the expression on the left.`}
          >
            <Icon name="sum" c="text-secondary" />
            <Text size="sm" c="text-secondary" style={{ whiteSpace: "nowrap" }}>
              {t`then on the summary`}
            </Text>
          </Group>
          <Box style={{ flex: "1 1 40%", minWidth: 0 }}>
            <ExpressionBar
              query={summaryQuery}
              stageIndex={summaryStageIndex}
              onChange={handleSummaryChange}
              allowOr={false}
              placeholder={t`Filter the summary, e.g. Count…`}
              hasInlineActions
            />
          </Box>
        </>
      )}
    </Group>
  );
}
