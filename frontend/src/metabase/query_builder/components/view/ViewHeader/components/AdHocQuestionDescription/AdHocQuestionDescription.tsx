import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import CS from "metabase/css/core/index.css";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type AdHocQuestionDescriptionProps = {
  onClick?: () => void;
} & GetAdhocQuestionDescriptionProps;

type GetAdhocQuestionDescriptionProps = {
  question: Question;
};

export const shouldRenderAdhocDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();
  const stageIndex = getInfoStageIndex(query);
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);

  return aggregations.length > 0 || breakouts.length > 0;
};

/**
 * Formats a human-readable description of the aggregations and breakouts at a
 * specific query stage. Used by both the query builder title and MCP app titles.
 *
 * @param stripTemporalBucket - When true, strips temporal bucket suffixes from
 *   breakout names (e.g. "Created At" instead of "Created At: Month"). Useful
 *   when the granularity is shown separately via a UI control.
 */
export const describeQueryStage = (
  query: Lib.Query,
  stageIndex: number,
  { stripTemporalBucket = false }: { stripTemporalBucket?: boolean } = {},
): string | null => {
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);

  let aggregationDescription: string | null = null;

  if (aggregations.length > 2) {
    aggregationDescription = ngettext(
      msgid`${aggregations.length} metric`,
      `${aggregations.length} metrics`,
      aggregations.length,
    );
  } else if (aggregations.length > 0) {
    aggregationDescription = aggregations
      .map(
        (aggregation) =>
          Lib.displayInfo(query, stageIndex, aggregation).longDisplayName,
      )
      .join(t` and `);
  }

  let breakoutDescription: string | null = null;
  if (breakouts.length > 2) {
    breakoutDescription = ngettext(
      msgid`${breakouts.length} breakout`,
      `${breakouts.length} breakouts`,
      breakouts.length,
    );
  } else if (breakouts.length > 0) {
    breakoutDescription = breakouts
      .map((breakout) => {
        if (stripTemporalBucket) {
          const column = Lib.breakoutColumn(query, stageIndex, breakout);

          const unbucketed =
            column && Lib.isTemporalBucketable(query, stageIndex, column)
              ? Lib.withTemporalBucket(column, null)
              : column;

          if (unbucketed) {
            return Lib.displayInfo(query, stageIndex, unbucketed).displayName;
          }
        }
        return Lib.displayInfo(query, stageIndex, breakout).longDisplayName;
      })
      .join(t` and `);
  }

  if (!aggregationDescription && !breakoutDescription) {
    return null;
  }

  return [aggregationDescription, breakoutDescription]
    .filter(Boolean)
    .join(t` by `);
};

export const getAdHocQuestionDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();

  return describeQueryStage(query, getInfoStageIndex(query));
};

export const AdHocQuestionDescription = ({
  question,
  onClick,
}: AdHocQuestionDescriptionProps) => {
  const adHocDescription = useMemo(() => {
    return getAdHocQuestionDescription({ question });
  }, [question]);

  if (!adHocDescription) {
    return null;
  }

  return (
    <span className={onClick ? CS.cursorPointer : ""} onClick={onClick}>
      {adHocDescription}
    </span>
  );
};

const getInfoStageIndex = (query: Lib.Query): number => {
  const hasExtraEmptyFilterStage =
    Lib.stageCount(query) > 1 && !Lib.hasClauses(query, -1);

  if (hasExtraEmptyFilterStage) {
    /**
     * If query is multi-stage and the last stage is empty (which means it's
     * an extra filtering stage - see Lib.ensureFilterStage), the last stage won't
     * provide any useful information to generate question description.
     * We have to use the previous, non-empty stage.
     */
    return -2;
  }

  return -1;
};
