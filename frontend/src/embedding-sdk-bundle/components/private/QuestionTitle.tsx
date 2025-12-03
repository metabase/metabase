import cx from "classnames";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import {
  getAdHocQuestionDescription,
  shouldRenderAdhocDescription,
} from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type GetQuestionTitleProps = {
  question?: Question;
};

export const getQuestionTitle = ({
  question,
}: GetQuestionTitleProps): string | null => {
  if (!question) {
    return null;
  }

  const isSaved = question.isSaved();
  const displayName = question.displayName();

  if (isSaved && displayName) {
    return displayName ?? null;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const adhocDescription = getAdHocQuestionDescription({ question });
  if (
    !isNative &&
    shouldRenderAdhocDescription({ question }) &&
    adhocDescription
  ) {
    return adhocDescription;
  }

  return null;
};

type QuestionTitleProps = GetQuestionTitleProps & CommonStylingProps;

export const QuestionTitle = ({
  question,
  className,
  style,
}: QuestionTitleProps) => {
  const questionTitle = getQuestionTitle({ question });
  const tc = useTranslateContent();

  if (questionTitle === null) {
    return null;
  }

  return (
    <h2 className={cx(CS.h2, CS.textWrap, className)} style={style}>
      {tc(questionTitle)}
    </h2>
  );
};
