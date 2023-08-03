import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";
import PropTypes from "prop-types";
import { getIn } from "icepick";
import { getMetadata } from "metabase/selectors/metadata";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import { CardApi } from "metabase/services";
import Button from "metabase/core/components/Button";
import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";
import { columnNameToUrl } from "metabase-enterprise/audit_app/lib/mode";
import Question from "metabase-lib/Question";
import { ErrorLink } from "./ErrorDetail.styled";

function idxToUrl(resRow, resCols, nameToResCol, colName) {
  const idVal = resRow[nameToResCol[colName]];
  const urlVal = colName && idVal ? columnNameToUrl[colName](idVal) : "";
  const isActive = urlVal !== "";
  return [urlVal, isActive];
}

function ErrorDetailDisplay(props) {
  const { result } = props;
  const resRow = getIn(result, ["data", "rows", 0]);
  const resCols = getIn(result, ["data", "cols"]);
  if (resRow && resCols) {
    const nameToResCol = resCols.reduce(
      (obj, x, idx) => Object.assign(obj, { [x.name]: idx }),
      {},
    );

    const linkColumns = [
      null,
      "collection_id",
      "database_id",
      null,
      "table_id",
      null,
      "user_id",
      null,
    ];

    const ordinaryRows = [
      "last_run_at",
      "collection_name",
      "database_name",
      "schema_name",
      "table_name",
      "total_runs",
      "user_name",
      "updated_at",
    ].map((x, idx) => {
      const [urlVal, isLinkActive] = idxToUrl(
        resRow,
        resCols,
        nameToResCol,
        linkColumns[idx],
      );
      const formattedVal = formatValue(resRow[nameToResCol[x]], {
        column: resCols[nameToResCol[x]],
        jsx: true,
        rich: true,
        type: "cell",
        local: true,
      });
      return (
        <tr key={x}>
          <td align="right" className="m0 mt1 text-medium">
            {formatColumn(resCols[nameToResCol[x]])}
          </td>
          <td>
            {
              <ErrorLink to={urlVal} isActive={isLinkActive}>
                {formattedVal}
              </ErrorLink>
            }
          </td>
        </tr>
      );
    });

    const dashIdRows = resRow[nameToResCol.dash_name_str]
      ?.split("|")
      ?.map((x, idx) => (
        <tr key={x}>
          <td align="right" className="m0 mt1 text-medium">
            {idx === 0 && formatColumn(resCols[nameToResCol.dash_name_str])}
          </td>
          <td className="text-bold">
            {formatValue(x, { column: resCols[nameToResCol.dash_name_str] })}
          </td>
        </tr>
      ));

    const [cardUrlVal, isLinkActive] = idxToUrl(
      resRow,
      resCols,
      nameToResCol,
      "card_id",
    );

    return [
      <h2 className="PageTitle py2" key="card_name">
        {
          <ErrorLink to={cardUrlVal} isActive={isLinkActive}>
            {resRow[nameToResCol.card_name]}
          </ErrorLink>
        }
      </h2>,
      <div
        key="error_str"
        className="half rounded p2 text-dark text-monospace text-small bg-light"
      >
        {resRow[nameToResCol.error_str]}
      </div>,
      <table key="table" className="mt4 half ContentTable">
        <tbody>{[ordinaryRows, dashIdRows]}</tbody>
      </table>,
    ];
  } else {
    return null;
  }
}

function ErrorDetail(props) {
  const { params, errorRetry } = props;
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
      <Button
        primary
        className="float-right"
        onClick={() => errorRetry(cardId)}
      >
        {t`Rerun this question`}
      </Button>
      <QuestionResultLoader question={question}>
        {({ rawSeries, result }) => <ErrorDetailDisplay result={result} />}
      </QuestionResultLoader>
    </div>
  );
}

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  errorRetry: async cardId => {
    await CardApi.query({ cardId: cardId });
    // we're imagining that we successfully reran, in which case we want to go back to overall table
    return push("/admin/tools/errors/");
  },
};

export default connect(mapStateToProps, mapDispatchToProps)(ErrorDetail);

ErrorDetail.propTypes = {
  params: PropTypes.object,
  errorRetry: PropTypes.func,
};
ErrorDetailDisplay.propTypes = {
  result: PropTypes.object,
};
