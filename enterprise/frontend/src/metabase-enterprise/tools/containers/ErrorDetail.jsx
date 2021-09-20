import React from "react";
import PropTypes from "prop-types";
import { getIn } from "icepick";

import Question from "metabase-lib/lib/Question";
import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";

const CARD_ID_ROW_IDX = 0;
const ErrorDrill = ({ clicked }) => {
  if (!clicked) {
    return [];
  }

  const cardId = clicked.origin.row[CARD_ID_ROW_IDX];

  return [
    {
      name: "detail",
      title: `View this`,
      default: true,
      url() {
        return `/admin/tools/errors/${cardId}`;
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  drills: () => [ErrorDrill],
};

function ErrorDetailDisplay(props) {
  const { result } = props;
  const resRow = getIn(result, ["data", "rows", 0]);
  const resCols = getIn(result, ["data", "cols"]);
  if (resRow && resCols) {
    return resRow.map((member, idx) =>
      <div key={idx}>
      <div>{resCols[idx].display_name}</div>
      <div>{member}</div>
      </div>);
  } else {
    return null;
  }
}

export default function ErrorDetail(props) {
  const { params } = props;
  const cardId = parseInt(params.cardId);
  // not the card in question, the card we're creating to query for the error details
  const card = {
    name: "Card Errors",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.query-detail/bad-card",
      args: [cardId],
    },
  };
  const question = new Question(card, null);

  return (
    <QuestionResultLoader question={question}>
      {({ rawSeries, result }) => <ErrorDetailDisplay result={result} />}
    </QuestionResultLoader>
  );
}

ErrorDetail.propTypes = {
  params: PropTypes.object,
};
ErrorDetailDisplay.propTypes = {
  result: PropTypes.object,
};
