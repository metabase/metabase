import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import type { updateQuestion } from "metabase/query_builder/actions";
import type Question from "metabase-lib/Question";

import QuestionDataSelector from "../../QuestionDataSelector";

type Props = {
  question: Question;
  updateQuestion: typeof updateQuestion;
};

function NewQuestionView({ question, updateQuestion }: Props) {
  return (
    <div className="full-height">
      <div className="p4 mx2">
        <QuestionDataSelector
          question={question}
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
