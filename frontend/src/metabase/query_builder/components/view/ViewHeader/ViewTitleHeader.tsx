import type React from "react";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/hooks/use-toggle";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import { ViewHeaderContainer } from "./ViewTitleHeader.styled";
import {
  AdHocQuestionLeftSide,
  QuestionFiltersHeader,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
  DashboardBackButton,
} from "./components";

interface ViewTitleHeaderProps {
  question: Question;
  isObjectDetail: boolean;
  isAdditionalInfoVisible?: boolean;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;

  isNavBarOpen: boolean;

  originalQuestion?: Question;
  isNative?: boolean;
  isSummarized?: boolean;

  result: Dataset;
  queryBuilderMode: QueryBuilderMode;
  isBookmarked: boolean;
  toggleBookmark: () => void;
  isSaved: boolean;
  isModelOrMetric: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isNativeEditorOpen: boolean;
  isShowingSummarySidebar: boolean;
  isDirty: boolean;
  isResultDirty: boolean;
  isActionListVisible: boolean;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
    ignoreCache?: boolean;
  }) => void;
  cancelQuery: () => void;
  onOpenModal: (modalType: string) => void;
  onEditSummary: () => void;
  onCloseSummary: () => void;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
  turnDatasetIntoQuestion: () => void;
  areFiltersExpanded: boolean;
  onExpandFilters: () => void;
  onCollapseFilters: () => void;
  isShowingQuestionInfoSidebar: boolean;
  onCloseQuestionInfo: () => void;
  onModelPersistenceChange: () => void;

  updateQuestion: (question: Question, opts: { run: boolean }) => void;

  className?: string;
  style?: React.CSSProperties;
}

export function ViewTitleHeader({
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
  className,
  style,
}: ViewTitleHeaderProps): React.JSX.Element {
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

    if (previousFiltersCount != null && filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters, previousQuery, query]);

  const { isNative } = Lib.queryDisplayInfo(query);
  const isSaved = question.isSaved();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;

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
          toggleBookmark={toggleBookmark}
          onOpenQuestionInfo={onOpenQuestionInfo}
          onCloseQuestionInfo={onCloseQuestionInfo}
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          onModelPersistenceChange={onModelPersistenceChange}
          isObjectDetail={isObjectDetail}
          isSaved={isSaved}
          isModelOrMetric={isModelOrMetric}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
        />
      </ViewHeaderContainer>

      {QuestionFiltersHeader.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
      }) && (
        <QuestionFiltersHeader
          expanded={areFiltersExpanded}
          question={question}
          updateQuestion={updateQuestion}
        />
      )}
    </>
  );
}
