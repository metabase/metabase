import type React from "react";
import { useCallback, useEffect, useState } from "react";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";
import {
  HeaderDivider,
  SavedQuestionHeaderButtonContainer,
  SavedQuestionLeftSideRoot,
  StyledLastEditInfoLabel,
  StyledQuestionDataSource,
  ViewHeaderLeftSubHeading,
  ViewHeaderMainLeftContentContainer,
} from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
import {
  HeadBreadcrumbs,
  QuestionDataSource,
} from "metabase/query_builder/components/view/ViewHeader/components";
import { HeaderCollectionBadge } from "metabase/query_builder/components/view/ViewHeader/components/HeaderCollectionBadge/HeaderCollectionBadge";
import type Question from "metabase-lib/v1/Question";

interface SavedQuestionLeftSideProps {
  question: Question;
  isObjectDetail?: boolean;
  isAdditionalInfoVisible?: boolean;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;
}

export function SavedQuestionLeftSide(
  props: SavedQuestionLeftSideProps,
): React.JSX.Element {
  const {
    question,
    isObjectDetail,
    isAdditionalInfoVisible,
    onOpenQuestionInfo,
    onSave,
  } = props;

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
    QuestionDataSource.shouldRender(props) && type === "question";
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
    <SavedQuestionLeftSideRoot
      data-testid="qb-header-left-side"
      showSubHeader={showSubHeader}
    >
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer isModelOrMetric={isModelOrMetric}>
          <HeadBreadcrumbs
            divider={<HeaderDivider>/</HeaderDivider>}
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
        </SavedQuestionHeaderButtonContainer>
      </ViewHeaderMainLeftContentContainer>
      {isAdditionalInfoVisible && (
        <ViewHeaderLeftSubHeading>
          {QuestionDataSource.shouldRender(props) && !isModelOrMetric && (
            <StyledQuestionDataSource
              question={question}
              isObjectDetail={isObjectDetail}
              originalQuestion={undefined} // can be removed, needed for typings
              subHead
            />
          )}
          {hasLastEditInfo && isAdditionalInfoVisible && (
            <StyledLastEditInfoLabel
              item={question.card()}
              onClick={onOpenQuestionInfo}
            />
          )}
        </ViewHeaderLeftSubHeading>
      )}
    </SavedQuestionLeftSideRoot>
  );
}
