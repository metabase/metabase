import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import type { updateQuestion } from "metabase/query_builder/actions";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import QuestionDataSelector from "../../QuestionDataSelector";

type Props = {
  legacyQuery: StructuredQuery;
  updateQuestion: typeof updateQuestion;
};

function NewQuestionView({ legacyQuery, updateQuestion }: Props) {
  return (
    <div className="full-height">
      <div className="p4 mx2">
        <QuestionDataSelector
          legacyQuery={legacyQuery}
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
