import cx from "classnames";
import { type MouseEvent, useMemo, useRef } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionBar, type ExpressionBarHandle } from "./ExpressionBar";
import S from "./ExpressionBar.module.css";

type StagedExpressionBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

/**
 * The expression bar with its trailing segment. Stage `stageIndex` is the
 * expression over the rows; once the stage has a summary, a second segment
 * follows for the filters on that summary (the next stage). Both segments
 * flow as one wrapping stream inside one bar, each on its own faintly
 * coloured band that wraps with its tokens. Arrow keys cross from the end of
 * one segment into the start of the next, as if it were one caret. Each is a full boolean expression;
 * the boundary is an AND that cannot be changed, since an OR across a summary
 * is not one query.
 */
export function StagedExpressionBar({
  query,
  stageIndex,
  onChange,
}: StagedExpressionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const rowsBarRef = useRef<ExpressionBarHandle>(null);
  const summaryBarRef = useRef<ExpressionBarHandle>(null);
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

  // Empty space belongs to whichever segment comes last: that is where new text goes.
  const handleBarClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      const inputs = barRef.current?.querySelectorAll("input");
      inputs?.[inputs.length - 1]?.focus();
    }
  };

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
    <Box
      ref={barRef}
      className={cx(S.bar, S.stagedBar)}
      onClick={handleBarClick}
    >
      <ExpressionBar
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
        layout="segment"
        className={cx(S.stageSegment, S.rowsStage)}
        leading={<StageBadge number={1} title={t`Stage 1: filters on rows`} />}
        handleRef={rowsBarRef}
        onExitEnd={() => summaryBarRef.current?.focusAt("start")}
      />
      <ExpressionBar
        query={summaryQuery}
        stageIndex={summaryStageIndex}
        onChange={handleSummaryChange}
        layout="segment"
        className={cx(S.stageSegment, S.summaryStage)}
        leading={
          <StageBadge number={2} title={t`Stage 2: filters on the summary`} />
        }
        placeholder={t`Filter the summary…`}
        handleRef={summaryBarRef}
        onExitStart={() => rowsBarRef.current?.focusAt("end")}
      />
    </Box>
  );
}

type StageBadgeProps = {
  number: number;
  title: string;
};

/** A small numbered circle at the head of a stage band, like the metric ids in the metrics explorer. */
function StageBadge({ number, title }: StageBadgeProps) {
  return (
    <Box component="span" className={S.stageBadgeSlot} title={title}>
      <Box component="span" className={S.stageBadge}>
        {number}
      </Box>
    </Box>
  );
}
