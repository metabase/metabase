import { type CSSProperties, useEffect } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/hooks/use-toggle";
import type { UpdateQuestionOpts } from "metabase/query_builder/actions";
import type { ModalType } from "metabase/query_builder/components/QueryModals";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { QueryBuilderMode } from "metabase-types/store";

import { ViewHeaderContainer } from "./ViewHeader.styled";
import {
  AdHocQuestionLeftSide,
  FilterHeader,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
  DashboardBackButton,
} from "./components";

type ViewTitleHeaderProps = {
  question: Question;
  result: Dataset | null;
  updateQuestion: (question: Question, config?: UpdateQuestionOpts) => void;
  originalQuestion: Question;
  queryBuilderMode: QueryBuilderMode;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;

  isDirty: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isNativeEditorOpen: boolean;
  isNavBarOpen: boolean;
  isShowingSummarySidebar: boolean;
  isObjectDetail: boolean;
  isAdditionalInfoVisible: boolean;

  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  cancelQuery: () => void;
  onOpenModal: (modal: ModalType) => void;
  onEditSummary: () => void;
  onCloseSummary: () => void;

  isBookmarked: boolean;
  isActionListVisible: boolean;

  turnDatasetIntoQuestion: () => void;
  toggleBookmark: () => void;
  onOpenQuestionInfo: () => void;
  onCloseQuestionInfo: () => void;

  isShowingQuestionInfoSidebar: boolean;

  onModelPersistenceChange: () => void;
  onSave: (
    question: Question,
    config?: { rerunQuery: boolean },
  ) => Promise<void>;
  className?: string;
  style?: CSSProperties;
};

export function ViewTitleHeader({
  cancelQuery,
  className,
  isActionListVisible,
  isAdditionalInfoVisible,
  isBookmarked,
  isDirty,
  isNativeEditorOpen,
  isNavBarOpen,
  isObjectDetail,
  isResultDirty,
  isRunnable,
  isRunning,
  isShowingQuestionInfoSidebar,
  isShowingSummarySidebar,
  onCloseQuestionInfo,
  onCloseSummary,
  onEditSummary,
  onModelPersistenceChange,
  onOpenModal,
  onOpenQuestionInfo,
  onSave,
  originalQuestion,
  queryBuilderMode,
  question,
  result,
  runQuestionQuery,
  setQueryBuilderMode,
  style,
  toggleBookmark,
  turnDatasetIntoQuestion,
  updateQuestion,
}: ViewTitleHeaderProps) {
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
    const previousFiltersCount = previousQuery
      ? Lib.filters(previousQuery, -1).length
      : 0;

    if (filtersCount > previousFiltersCount) {
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
            isNative={isNative}
            isSummarized={isSummarized}
            question={question}
            originalQuestion={originalQuestion}
            onOpenModal={onOpenModal}
            isObjectDetail={isObjectDetail}
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
      {FilterHeader.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
      }) && (
        <FilterHeader
          expanded={areFiltersExpanded}
          question={question}
          updateQuestion={updateQuestion}
        />
      )}
    </>
  );
}
