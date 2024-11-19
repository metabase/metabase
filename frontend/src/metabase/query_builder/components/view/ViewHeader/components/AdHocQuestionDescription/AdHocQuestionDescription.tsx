import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { AggregationAndBreakoutDescription } from "./AdHocQuestionDescription.styled";

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
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);

  return aggregations.length > 0 || breakouts.length > 0;
};

export const getAdHocQuestionDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
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
                Lib.displayInfo(query, STAGE_INDEX, aggregation)
                  .longDisplayName,
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
                Lib.displayInfo(query, STAGE_INDEX, breakout).longDisplayName,
            )
            .join(t` and `);

  if (!aggregationDescription && !breakoutDescription) {
    return null;
  }

  return [aggregationDescription, breakoutDescription]
    .filter(Boolean)
    .join(t` by `);
};

const STAGE_INDEX = -1;
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
    <AggregationAndBreakoutDescription onClick={onClick}>
      {adHocDescription}
    </AggregationAndBreakoutDescription>
  );
};
