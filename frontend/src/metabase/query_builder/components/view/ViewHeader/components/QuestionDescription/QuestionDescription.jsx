/* eslint-disable react/prop-types */
import { t, ngettext, msgid } from "ttag";

import * as Lib from "metabase-lib";

import { QuestionDataSource } from "../QuestionDataSource";

import { AggregationAndBreakoutDescription } from "./QuestionDescription.styled";

export const QuestionDescription = ({
  question,
  originalQuestion,
  isObjectDetail,
  onClick,
}) => {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (!isNative) {
    const stageIndex = -1;
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
    if (aggregationDescription || breakoutDescription) {
      return (
        <AggregationAndBreakoutDescription onClick={onClick}>
          {[aggregationDescription, breakoutDescription]
            .filter(Boolean)
            .join(t` by `)}
        </AggregationAndBreakoutDescription>
      );
    }
  }
  if (question.database()) {
    return (
      <QuestionDataSource
        question={question}
        originalQuestion={originalQuestion}
        isObjectDetail={isObjectDetail}
      />
    );
  } else {
    return <span>{t`New question`}</span>;
  }
};
