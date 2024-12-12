import type React from "react";
import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ViewHeading, ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import { DashboardSaveLocation } from "../DashboardSaveLocation";
import { QuestionDataSource } from "../QuestionDataSource";
import { QuestionDescription } from "../QuestionDescription";

import AdHocQuestionLeftSideS from "./AdHocQuestionLeftSide.module.css";

interface AdHocQuestionLeftSideProps {
  question: Question;
  originalQuestion?: Question;
  isNative: boolean;
  isObjectDetail?: boolean;
  isSummarized?: boolean;
  onOpenModal: (key: QueryModalType) => void;
}

export function AdHocQuestionLeftSide(
  props: AdHocQuestionLeftSideProps,
): React.JSX.Element {
  const {
    question,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
    onOpenModal,
  } = props;

  const handleTitleClick = () => {
    const { isEditable } = Lib.queryDisplayInfo(question.query());

    if (isEditable) {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  };

  const dashboardName = question.dashboardName();

  return (
    <Box className={AdHocQuestionLeftSideS.AdHocLeftSideRoot}>
      <Flex align="center" wrap="nowrap">
        <ViewHeading
          className={ViewTitleHeaderS.AdHocViewHeading}
          color="medium"
        >
          {isNative ? (
            t`New question`
          ) : (
            <QuestionDescription
              question={question}
              isNative={isNative}
              originalQuestion={originalQuestion}
              isObjectDetail={isObjectDetail}
              onClick={handleTitleClick}
            />
          )}
        </ViewHeading>
      </Flex>
      <ViewSubHeading className={ViewTitleHeaderS.ViewHeaderLeftSubHeading}>
        {isSummarized && (
          <QuestionDataSource
            question={question}
            originalQuestion={undefined} // can be removed, needed for typings
            isObjectDetail={isObjectDetail}
            subHead
          />
        )}
        {dashboardName && (
          <DashboardSaveLocation dashboardName={dashboardName} />
        )}
      </ViewSubHeading>
    </Box>
  );
}
