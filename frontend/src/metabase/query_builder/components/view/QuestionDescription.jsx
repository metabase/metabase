import React from "react";

import { t, ngettext, msgid } from "ttag";

import QuestionDataSource from "./QuestionDataSource";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const QuestionDescription = ({ question }) => {
  const query = question.query();
  if (query instanceof StructuredQuery) {
    const topQuery = query.topLevelQuery();
    const aggregations = topQuery.aggregations();
    const breakouts = topQuery.breakouts();
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
            .map(aggregation => aggregation.displayName())
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
        : breakouts.map(breakout => breakout.displayName()).join(t` and `);
    if (aggregationDescription && breakoutDescription) {
      return (
        <span>{t`${aggregationDescription} by ${breakoutDescription}`}</span>
      );
    } else if (aggregationDescription) {
      return <span>{aggregationDescription}</span>;
    } else if (breakoutDescription) {
      return <span>{breakoutDescription}</span>;
    }
  }
  if (question.database()) {
    return <QuestionDataSource question={question} />;
  } else {
    return <span>{t`New question`}</span>;
  }
};

export default QuestionDescription;
