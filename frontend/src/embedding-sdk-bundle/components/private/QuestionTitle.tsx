import cx from "classnames";

import { getQuestionTitle } from "embedding-sdk-bundle/lib/sdk-question/get-question-title";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";

type QuestionTitleProps = {
  question?: Parameters<typeof getQuestionTitle>[0];
} & CommonStylingProps;

export const QuestionTitle = ({
  question,
  className,
  style,
}: QuestionTitleProps) => {
  const tc = useTranslateContent();
  const questionTitle = getQuestionTitle(question, tc);

  if (questionTitle === null) {
    return null;
  }

  return (
    <h2 className={cx(CS.h2, CS.textWrap, className)} style={style}>
      {questionTitle}
    </h2>
  );
};
