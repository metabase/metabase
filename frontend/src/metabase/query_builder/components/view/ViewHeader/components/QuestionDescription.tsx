import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { AdHocQuestionDescription } from "./AdHocQuestionDescription";
import { shouldRenderAdhocDescription } from "./AdHocQuestionDescription/AdHocQuestionDescription";
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

  if (Lib.databaseMetadata(question.query()) != null) {
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
