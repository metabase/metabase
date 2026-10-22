import { useMemo } from "react";
import { t } from "ttag";

import { Box, Group } from "metabase/ui";
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
 * expression over the rows; once the stage has a summary, a second segment
 * follows for the filters on that summary (the next stage). Those can only
 * be AND-ed, since an OR across a summary is not one query.
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

  if (!hasSummary) {
    return (
      <ExpressionBar
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
        hasInlineActions
      />
    );
  }

  return (
    <Group gap={0} align="flex-start" w="100%" wrap="nowrap">
      <Box className={S.rowsSegment}>
        <ExpressionBar
          query={query}
          stageIndex={stageIndex}
          onChange={onChange}
          className={S.rowsSegmentBar}
          hasInlineActions
        />
      </Box>
      <Box className={S.summarySegment}>
        <ExpressionBar
          query={summaryQuery}
          stageIndex={summaryStageIndex}
          onChange={handleSummaryChange}
          className={S.summarySegmentBar}
          allowOr={false}
          placeholder={t`Filter the summary…`}
          hasInlineActions
        />
      </Box>
    </Group>
  );
}
