import { useMemo } from "react";

import CS from "metabase/css/core/index.css";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { describeQueryStage, getInfoStageIndex } from "./utils";

type AdHocQuestionDescriptionProps = {
  onClick?: () => void;
} & GetAdhocQuestionDescriptionProps;

type GetAdhocQuestionDescriptionProps = {
  question: Question;
};

export const shouldRenderAdhocDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();
  const stageIndex = getInfoStageIndex(query);
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);

  return aggregations.length > 0 || breakouts.length > 0;
};

export const getAdHocQuestionDescription = ({
  question,
}: GetAdhocQuestionDescriptionProps) => {
  const query = question.query();

  return describeQueryStage(query, getInfoStageIndex(query));
};

export const AdHocQuestionDescription = ({
  question,
  onClick,
}: AdHocQuestionDescriptionProps) => {
  const adHocDescription = useMemo(() => {
    return getAdHocQuestionDescription({ question });
  }, [question]);

  if (!adHocDescription) {
    return null;
  }

  return (
    <span className={onClick ? CS.cursorPointer : ""} onClick={onClick}>
      {adHocDescription}
    </span>
  );
};

export { describeQueryStage, getInfoStageIndex };
