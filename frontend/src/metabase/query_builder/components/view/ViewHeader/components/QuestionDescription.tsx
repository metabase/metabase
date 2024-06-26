import { t } from "ttag";

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
  if (!isNative && AdHocQuestionDescription.shouldRender(question)) {
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
