import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  getAdHocQuestionDescription,
  shouldRenderAdhocDescription,
} from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type QuestionTitleProps = {
  question?: Question;
};

export const getQuestionTitle = ({ question }: QuestionTitleProps): string => {
  if (!question) {
    return t`New question`;
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

  return t`New question`;
};

export const QuestionTitle = ({ question }: QuestionTitleProps) => {
  const questionTitle = getQuestionTitle({ question });

  return <h2 className={cx(CS.h2, CS.textWrap)}>{questionTitle}</h2>;
};
