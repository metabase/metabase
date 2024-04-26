import cx from "classnames";
import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import CS from "metabase/css/core/index.css";
import type { updateQuestion } from "metabase/query_builder/actions";
import { QuestionDataSelector } from "metabase/query_builder/components/view/QuestionDataSelector";
import type Question from "metabase-lib/v1/Question";

type Props = {
  question: Question;
  updateQuestion: typeof updateQuestion;
};

function NewQuestionView({ question, updateQuestion }: Props) {
  return (
    <div className={CS.fullHeight}>
      <div className={cx(CS.p4, CS.mx2)}>
        <QuestionDataSelector
          question={question}
          updateQuestion={updateQuestion}
          triggerElement={
            <Subhead className={CS.mb2}>{t`Pick your data`}</Subhead>
          }
        />
      </div>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewQuestionView;
