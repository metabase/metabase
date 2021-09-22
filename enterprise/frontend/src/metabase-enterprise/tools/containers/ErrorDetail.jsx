import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import { getIn } from "icepick";
import cx from "classnames";

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
    const nameToResCol = resCols.reduce(
      (obj, x, idx) => Object.assign(obj, {[x.name]: idx}),
      {});

    return (<div>
      <h2>{resRow[nameToResCol.card_name]}</h2>
      <div className={cx({"text-code": true})}>
      {resRow[nameToResCol.error_str]}
      </div>

      <table><tbody>
      <tr>
      <td>{t`Last Run At`}</td>
      <td>{resRow[nameToResCol.last_run_at]}</td>
      </tr>
      <tr>
      <td>{t`Collection`}</td>
      <td>{resRow[nameToResCol.collection_name]}</td>
      </tr>
      <tr>
      <td>{t`Database`}</td>
      <td>{resRow[nameToResCol.database_name]}</td>
      </tr>
      <tr>
      <td>{t`Table`}</td>
      <td>{resRow[nameToResCol.table_name]}</td>
      </tr>
      <tr>
      <td>{t`Total Executions`}</td>
      <td>{resRow[nameToResCol.total_runs]}</td>
      </tr>
      <tr>
      <td>{t`Last Edited By`}</td>
      <td>{resRow[nameToResCol.user_name]}</td>
      </tr>
      <tr>
      <td>{t`Last Edited At`}</td>
      <td>{resRow[nameToResCol.updated_at]}</td>
      </tr>
      <tr>
      <td>{t`Dashboards it's in`}</td>
      <td>{resRow[nameToResCol.dash_ids_str]}</td>
      </tr>
      </tbody></table>
      </div>);
  } else {
    return null;
  }
}

function ErrorRetryButton(props) {
  return null;
}

export default function ErrorDetail(props) {
  const { params } = props;
  const cardId = parseInt(params.cardId);
  // below card is not the card in question, but
  // the card we're creating to query for the error details
  const card = {
    name: "Card Errors",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.query-detail/bad-card",
      args: [cardId],
    },
  };
  const question = new Question(card, null);

  return (
    <div>
    <QuestionResultLoader question={question}>
      {({ rawSeries, result }) => <ErrorDetailDisplay result={result} />}
    </QuestionResultLoader>
    <ErrorRetryButton cardId={cardId} />
    </div>
  );
}

ErrorDetail.propTypes = {
  params: PropTypes.object,
};
ErrorDetailDisplay.propTypes = {
  result: PropTypes.object,
};
ErrorRetryButton.propTypes = {
  cardId: PropTypes.integer,
};
