import { push } from "react-router-redux";
import { t } from "ttag";

import { QuestionResultLoader } from "metabase/containers/QuestionResultLoader";
import Button from "metabase/core/components/Button";
import { useDispatch } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { ErrorDetailDisplay } from "metabase-enterprise/tools/ErrorDetailDisplay";
import Question from "metabase-lib/v1/Question";
import type { CardId , Dataset } from "metabase-types/api";

export const ErrorDetail = ({ params }: { params: { cardId: CardId } }) => {
  const dispatch = useDispatch();
  const errorRetry = async (cardId: CardId) => {
    await CardApi.query({ cardId });
    // we're imagining that we successfully reran, in which case we want to go back to overall table
    return dispatch(push("/admin/tools/errors/"));
  };

  const cardId = params.cardId;

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
  const question = new Question(card, undefined);

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
        {({ result }: { result: Dataset }) => (
          <ErrorDetailDisplay result={result} />
        )}
      </QuestionResultLoader>
    </div>
  );
};
