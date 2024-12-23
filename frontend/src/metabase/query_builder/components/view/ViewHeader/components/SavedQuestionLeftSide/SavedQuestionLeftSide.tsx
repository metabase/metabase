import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";
import { Box, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";
import { HeaderCollectionBadge } from "../HeaderCollectionBadge";
import { QuestionDataSource } from "../QuestionDataSource";

import SavedQuestionLeftSideS from "./SavedQuestionLeftSide.module.css";
import { ViewOnlyTag } from "./ViewOnly";

export interface SavedQuestionLeftSideProps {
  question: Question;
  isObjectDetail?: boolean;
  isAdditionalInfoVisible?: boolean;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;
}

export function SavedQuestionLeftSide({
  question,
  isObjectDetail,
  isAdditionalInfoVisible,
  onOpenQuestionInfo,
  onSave,
}: SavedQuestionLeftSideProps): React.JSX.Element {
  const [showSubHeader, setShowSubHeader] = useState(true);

  const hasLastEditInfo = question.lastEditInfo() != null;
  const type = question.type();
  const isModelOrMetric = type === "model" || type === "metric";

  const onHeaderChange = useCallback(
    (name: string) => {
      if (name && name !== question.displayName()) {
        onSave(question.setDisplayName(name));
      }
    },
    [question, onSave],
  );

  const renderDataSource =
    QuestionDataSource.shouldRender({ question, isObjectDetail }) &&
    type === "question";
  const renderLastEdit = hasLastEditInfo && isAdditionalInfoVisible;

  useEffect(() => {
    const timerId = setTimeout(() => {
      if (isAdditionalInfoVisible && (renderDataSource || renderLastEdit)) {
        setShowSubHeader(false);
      }
    }, 4000);
    return () => clearTimeout(timerId);
  }, [isAdditionalInfoVisible, renderDataSource, renderLastEdit]);

  return (
    <Box
      className={cx(ViewTitleHeaderS.SavedQuestionLeftSideRoot, {
        [ViewTitleHeaderS.showSubHeader]: showSubHeader,
      })}
      data-testid="qb-header-left-side"
    >
      <Flex align="center" wrap="nowrap">
        <Box
          className={cx(ViewTitleHeaderS.SavedQuestionHeaderButtonContainer, {
            [ViewTitleHeaderS.isModelOrMetric]: isModelOrMetric,
          })}
        >
          <Flex align="center" gap="sm">
            <HeadBreadcrumbs
              divider={
                <span className={ViewTitleHeaderS.HeaderDivider}>/</span>
              }
              parts={[
                ...(isAdditionalInfoVisible && isModelOrMetric
                  ? [
                      <HeaderCollectionBadge
                        key="collection"
                        question={question}
                      />,
                    ]
                  : []),

                <SavedQuestionHeaderButton
                  key={question.displayName()}
                  question={question}
                  onSave={onHeaderChange}
                />,
              ]}
            />

            <ViewOnlyTag question={question} />
          </Flex>
        </Box>
      </Flex>
      {isAdditionalInfoVisible && (
        <ViewSubHeading className={ViewTitleHeaderS.ViewHeaderLeftSubHeading}>
          {QuestionDataSource.shouldRender({ question, isObjectDetail }) &&
            !isModelOrMetric && (
              <QuestionDataSource
                className={SavedQuestionLeftSideS.StyledQuestionDataSource}
                question={question}
                isObjectDetail={isObjectDetail}
                originalQuestion={undefined} // can be removed, needed for typings
                subHead
              />
            )}
          {hasLastEditInfo && isAdditionalInfoVisible && (
            <LastEditInfoLabel
              className={SavedQuestionLeftSideS.StyledLastEditInfoLabel}
              item={question.card()}
              onClick={onOpenQuestionInfo}
            />
          )}
        </ViewSubHeading>
      )}
    </Box>
  );
}
