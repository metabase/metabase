import cx from "classnames";
import type React from "react";
import { t } from "ttag";

import type { PropsWithHTMLStyle } from "embedding-sdk/types/default-style-props";
import CS from "metabase/css/core/index.css";
import { AdHocQuestionDescription } from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface QuestionTitleProps {
  question: Question;
}

export const QuestionTitle = ({
  question,
  className,
  style,
}: PropsWithHTMLStyle<QuestionTitleProps>): React.JSX.Element => {
  const isSaved = question.isSaved();

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return (
    <h2 className={cx(CS.h2, CS.textWrap, className)} style={style}>
      {isSaved ? (
        question.displayName()
      ) : !isNative && AdHocQuestionDescription.shouldRender(question) ? (
        <AdHocQuestionDescription question={question} />
      ) : (
        t`New question`
      )}
    </h2>
  );
};
