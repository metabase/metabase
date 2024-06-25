import cx from "classnames";
import type React from "react";

import CS from "metabase/css/core/index.css";
import { QuestionDescription } from "metabase/query_builder/components/view/ViewHeader/components";
import type Question from "metabase-lib/v1/Question";

interface QuestionTitleProps {
  question: Question;
}

export const QuestionTitle = ({
  question,
}: QuestionTitleProps): React.JSX.Element => {
  const isSaved = question.isSaved();

  return (
    <h2 className={cx(CS.h2, CS.textWrap)}>
      {isSaved ? (
        question.displayName()
      ) : (
        <QuestionDescription question={question} />
      )}
    </h2>
  );
};
