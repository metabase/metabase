import type React from "react";
import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  AdHocLeftSideRoot,
  AdHocViewHeading,
  ViewHeaderLeftSubHeading,
  ViewHeaderMainLeftContentContainer,
} from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
import {
  QuestionDataSource,
  QuestionDescription,
} from "metabase/query_builder/components/view/ViewHeader/components";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

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

  const saveToDashboardId = question.dashboardId();
  const { data: saveToDashboard } = useGetDashboardQuery(
    saveToDashboardId ? { id: saveToDashboardId } : skipToken,
  );

  return (
    <AdHocLeftSideRoot>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading color="medium">
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
        </AdHocViewHeading>
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        {isSummarized && (
          <QuestionDataSource
            question={question}
            originalQuestion={undefined} // can be removed, needed for typings
            isObjectDetail={isObjectDetail}
            subHead
          />
        )}
        {saveToDashboard && (
          <Text size="sm" fw="bold" color="text-light">
            <Flex align="center" gap="sm" color="text-light">
              <Icon name="dashboard" size={12} />
              {saveToDashboard?.name}
            </Flex>
          </Text>
        )}
      </ViewHeaderLeftSubHeading>
    </AdHocLeftSideRoot>
  );
}
