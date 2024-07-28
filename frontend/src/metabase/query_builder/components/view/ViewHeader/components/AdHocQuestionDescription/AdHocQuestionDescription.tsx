import { msgid, ngettext, t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { AggregationAndBreakoutDescription } from "./AdHocQuestionDescription.styled";

interface AdHocQuestionDescriptionProps {
  question: Question;
  onClick?: () => void;
}

const STAGE_INDEX = -1;
export const AdHocQuestionDescription = ({
  question,
  onClick,
}: AdHocQuestionDescriptionProps) => {
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
              Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName,
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

  if (aggregationDescription || breakoutDescription) {
    return (
      <AggregationAndBreakoutDescription onClick={onClick}>
        {[aggregationDescription, breakoutDescription]
          .filter(Boolean)
          .join(t` by `)}
      </AggregationAndBreakoutDescription>
    );
  }
};

AdHocQuestionDescription.shouldRender = (question: Question): boolean => {
  const query = question.query();
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);

  return aggregations.length > 0 || breakouts.length > 0;
};
