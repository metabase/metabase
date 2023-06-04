import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import type { updateQuestion } from "metabase/query_builder/actions";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import QuestionDataSelector from "../../QuestionDataSelector";

type Props = {
  query: StructuredQuery;
  updateQuestion: typeof updateQuestion;
};

function NewQuestionView({ query, updateQuestion }: Props) {
  return (
    <div className="full-height">
      <div className="p4 mx2">
        <QuestionDataSelector
          query={query}
          updateQuestion={updateQuestion}
          triggerElement={
            <Subhead className="mb2">{t`Pick your data`}</Subhead>
          }
        />
      </div>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewQuestionView;
