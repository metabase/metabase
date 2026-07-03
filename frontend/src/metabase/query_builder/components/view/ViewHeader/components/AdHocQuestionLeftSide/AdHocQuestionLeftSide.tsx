import type React from "react";
import { t } from "ttag";

import {
  isNewQuerySqlIdle,
  parseNewQueryMode,
} from "metabase/nav/containers/ProtoNavbar/newQuery";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ViewHeading, ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
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
  const { pathname } = useSelector(getLocation);
  const hideNativeTitle = isNewQuerySqlIdle(pathname, question);
  const nativeTitle =
    parseNewQueryMode(pathname) === "sql" ? t`New query` : t`New question`;

  const handleTitleClick = () => {
    const { isEditable } = Lib.queryDisplayInfo(question.query());

    if (isEditable) {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  };

  return (
    <Box className={AdHocQuestionLeftSideS.AdHocLeftSideRoot}>
      <Flex align="center" wrap="nowrap">
        {!hideNativeTitle && (
          <ViewHeading
            className={ViewTitleHeaderS.AdHocViewHeading}
            c="text-secondary"
          >
            {isNative ? (
              nativeTitle
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
        )}
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
      </ViewSubHeading>
    </Box>
  );
}
