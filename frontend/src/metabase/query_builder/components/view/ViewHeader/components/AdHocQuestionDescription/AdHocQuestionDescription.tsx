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

export const getAdHocQuestionDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();
  const stageIndex = getInfoStageIndex(query);
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);
  const aggregationDescription =
    aggregations.length === 0
      ? null
      : aggregations.length > 2
        ? ngettext(
            msgid`${aggregations.length} metric`,
            `${aggregations.length} metrics`,
            aggregations.length,
          )
        : aggregations
            .map(
              aggregation =>
                Lib.displayInfo(query, stageIndex, aggregation).longDisplayName,
            )
            .join(t` and `);
  const breakoutDescription =
    breakouts.length === 0
      ? null
      : breakouts.length > 2
        ? ngettext(
            msgid`${breakouts.length} breakout`,
            `${breakouts.length} breakouts`,
            breakouts.length,
          )
        : breakouts
            .map(
              breakout =>
                Lib.displayInfo(query, stageIndex, breakout).longDisplayName,
            )
            .join(t` and `);

  if (!aggregationDescription && !breakoutDescription) {
    return null;
  }

  return [aggregationDescription, breakoutDescription]
    .filter(Boolean)
    .join(t` by `);
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
