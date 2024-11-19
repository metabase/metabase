import { t } from "ttag";

import { shouldRenderAdhocDescription } from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import type Question from "metabase-lib/v1/Question";

import { AdHocQuestionDescription } from "./AdHocQuestionDescription";
import { QuestionDataSource } from "./QuestionDataSource";

interface QuestionDescriptionProps {
  question: Question;
  isNative: boolean;
  originalQuestion?: Question;
  isObjectDetail?: boolean;
  onClick?: () => void;
}

export const QuestionDescription = ({
  question,
  isNative,
  originalQuestion,
  isObjectDetail,
  onClick,
}: QuestionDescriptionProps) => {
  if (!isNative && shouldRenderAdhocDescription({ question })) {
    return <AdHocQuestionDescription question={question} onClick={onClick} />;
  }

  if (question.database()) {
    return (
      <QuestionDataSource
        question={question}
        originalQuestion={originalQuestion}
        isObjectDetail={isObjectDetail}
      />
    );
  } else {
    return <span>{t`New question`}</span>;
  }
};
