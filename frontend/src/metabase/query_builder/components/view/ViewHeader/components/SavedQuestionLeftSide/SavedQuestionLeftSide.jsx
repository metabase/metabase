import PropTypes from "prop-types";
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
} from "metabase/query_builder/components/view/ViewHeader/ViewHeader.styled";
import {
  HeadBreadcrumbs,
  QuestionDataSource,
} from "metabase/query_builder/components/view/ViewHeader/components";
import { HeaderCollectionBadge } from "metabase/query_builder/components/view/ViewHeader/components/HeaderCollectionBadge/HeaderCollectionBadge";

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  onOpenQuestionInfo: PropTypes.func.isRequired,
  onSave: PropTypes.func,
};
export function SavedQuestionLeftSide(props) {
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
    name => {
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
