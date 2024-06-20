import PropTypes from "prop-types";
import { useCallback, useEffect } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/hooks/use-toggle";
import * as Lib from "metabase-lib";

import { ViewHeaderContainer } from "./ViewHeader.styled";
import {
  AdHocQuestionLeftSide,
  DashboardBackButton,
  QuestionFiltersHeader,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
} from "./components";

const viewTitleHeaderPropTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,

  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  setQueryBuilderMode: PropTypes.func,

  result: PropTypes.object,

  isDirty: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isNavBarOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,

  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,
  updateQuestion: PropTypes.func,

  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  onOpenQuestionDetails: PropTypes.func,

  className: PropTypes.string,
  style: PropTypes.object,
};

// interface ViewTitleHeaderProps {
//   question: Question;
//   isObjectDetail: boolean;
//   isAdditionalInfoVisible?: boolean;
//   onOpenQuestionInfo: () => void;
//   onSave: (newQuestion: Question) => any;
//
//   isNavBarOpen: boolean;
//
//   originalQuestion?: Question;
//   isNative?: boolean;
//   isSummarized?: boolean;
//
//   result: Dataset;
//   queryBuilderMode: QueryBuilderMode;
//   isBookmarked: boolean;
//   toggleBookmark: () => void;
//   isSaved: boolean;
//   isModelOrMetric: boolean;
//   isRunnable: boolean;
//   isRunning: boolean;
//   isNativeEditorOpen: boolean;
//   isShowingSummarySidebar: boolean;
//   isDirty: boolean;
//   isResultDirty: boolean;
//   isActionListVisible: boolean;
//   runQuestionQuery: (parameters: { ignoreCache: boolean }) => void;
//   cancelQuery: () => void;
//   onOpenModal: (modalType: string) => void;
//   onEditSummary: () => void;
//   onCloseSummary: () => void;
//   setQueryBuilderMode: (
//     mode: QueryBuilderMode,
//     opt: { datasetEditorTab: DatasetEditorTab },
//   ) => void;
//   turnDatasetIntoQuestion: () => void;
//   areFiltersExpanded: boolean;
//   onExpandFilters: () => void;
//   onCollapseFilters: () => void;
//   isShowingQuestionInfoSidebar: boolean;
//   onCloseQuestionInfo: () => void;
//   onModelPersistenceChange: () => void;
//
//   updateQuestion: (question: Question, opts: { run: boolean }) => void;
//
//   className?: string;
//   style?: React.CSSProperties;
// }

export function ViewTitleHeader(props) {
  const {
    question,
    isObjectDetail,
    isAdditionalInfoVisible,
    onOpenQuestionInfo,
    onSave,
    onOpenModal,
    isNavBarOpen,
    result,
    queryBuilderMode,
    updateQuestion,
    isBookmarked,
    toggleBookmark,
    isRunnable,
    isRunning,
    isNativeEditorOpen,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    isActionListVisible,
    runQuestionQuery,
    cancelQuery,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
    turnDatasetIntoQuestion,
    isShowingQuestionInfoSidebar,
    onCloseQuestionInfo,
    onModelPersistenceChange,
  } = props;

  const { className, style } = props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  const query = question.query();
  const previousQuery = usePrevious(query);

  useEffect(() => {
    const { isNative } = Lib.queryDisplayInfo(query);
    const isPreviousQuestionNative =
      previousQuery && Lib.queryDisplayInfo(previousQuery).isNative;

    if (isNative || isPreviousQuestionNative) {
      return;
    }

    const filtersCount = Lib.filters(query, -1).length;
    const previousFiltersCount =
      previousQuery && Lib.filters(previousQuery, -1).length;

    if (!!previousFiltersCount && filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters, previousQuery, query]);

  const { isNative } = Lib.queryDisplayInfo(query);
  const isSaved = question.isSaved();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;

  const onQueryChange = useCallback(
    newQuery => {
      updateQuestion(newQuery.question(), { run: true });
    },
    [updateQuestion],
  );

  return (
    <>
      <ViewHeaderContainer
        className={className}
        style={style}
        data-testid="qb-header"
        isNavBarOpen={isNavBarOpen}
      >
        <DashboardBackButton />

        {isSaved ? (
          <SavedQuestionLeftSide
            question={question}
            isObjectDetail={isObjectDetail}
            isAdditionalInfoVisible={isAdditionalInfoVisible}
            onOpenQuestionInfo={onOpenQuestionInfo}
            onSave={onSave}
          />
        ) : (
          <AdHocQuestionLeftSide
            question={question}
            isObjectDetail={isObjectDetail}
            // isAdditionalInfoVisible={isAdditionalInfoVisible}
            isNative={isNative}
            isSummarized={isSummarized}
            onOpenModal={onOpenModal}
          />
        )}
        <ViewTitleHeaderRightSide
          question={question}
          result={result}
          queryBuilderMode={queryBuilderMode}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isNativeEditorOpen={isNativeEditorOpen}
          isShowingSummarySidebar={isShowingSummarySidebar}
          isDirty={isDirty}
          isResultDirty={isResultDirty}
          isActionListVisible={isActionListVisible}
          runQuestionQuery={runQuestionQuery}
          cancelQuery={cancelQuery}
          onOpenModal={onOpenModal}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
          setQueryBuilderMode={setQueryBuilderMode}
          turnDatasetIntoQuestion={turnDatasetIntoQuestion}
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          onCloseQuestionInfo={onCloseQuestionInfo}
          onOpenQuestionInfo={onOpenQuestionInfo}
          onModelPersistenceChange={onModelPersistenceChange}
          isObjectDetail={isObjectDetail}
          isSaved={isSaved}
          isModelOrMetric={isModelOrMetric}
          // isNative={isNative}
          // isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
          // onQueryChange={onQueryChange}
        />
      </ViewHeaderContainer>

      {QuestionFiltersHeader.shouldRender(props) && (
        <QuestionFiltersHeader
          expanded={areFiltersExpanded}
          question={question}
          updateQuestion={updateQuestion}
        />
      )}
    </>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;
