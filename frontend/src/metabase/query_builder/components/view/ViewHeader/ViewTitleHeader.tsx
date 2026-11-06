import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/common/hooks/use-toggle";
import type {
  DatasetEditorTab,
  QueryBuilderMode,
  QueryModalType,
} from "metabase/redux/store";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { ViewSection } from "../ViewSection";

import ViewTitleHeaderS from "./ViewTitleHeader.module.css";
import {
  AdHocQuestionLeftSide,
  KeyboardFilterRow,
  QueryBuilderBackButton,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
} from "./components";

interface ViewTitleHeaderProps {
  question: Question;
  isObjectDetail: boolean;
  isAdditionalInfoVisible?: boolean;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;

  isNavBarOpen: boolean;

  originalQuestion?: Question;
  isSummarized?: boolean;

  result?: Dataset;
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
  onOpenModal: (modalType: QueryModalType) => void;
  editSummary: () => void;
  onCloseSummary: () => void;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
  areFiltersExpanded: boolean;
  onExpandFilters: () => void;
  onCollapseFilters: () => void;
  isShowingQuestionInfoSidebar: boolean;
  onCloseQuestionInfo: () => void;

  updateQuestion: (
    question: Question,
    opts?: { run?: boolean; shouldUpdateUrl?: boolean },
  ) => void;

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
  originalQuestion,
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
  editSummary,
  onCloseSummary,
  setQueryBuilderMode,
  isShowingQuestionInfoSidebar,
  onCloseQuestionInfo,
  className,
  style,
}: ViewTitleHeaderProps): React.JSX.Element {
  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());
  const [draftFilterKey, setDraftFilterKey] = useState<number | null>(null);

  const addDraftFilter = useCallback(() => {
    expandFilters();
    setDraftFilterKey((key) => (key ?? 0) + 1);
  }, [expandFilters]);

  const removeDraftFilter = useCallback(() => setDraftFilterKey(null), []);

  const hideFilters = useCallback(() => {
    collapseFilters();
    setDraftFilterKey(null);
  }, [collapseFilters]);

  const previousQuestion = usePrevious(question);

  const query = question.query();
  const previousQuery = usePrevious(query);
  const { isNative } = Lib.queryDisplayInfo(query);

  useEffect(() => {
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
  }, [
    previousQuestion,
    question,
    expandFilters,
    previousQuery,
    query,
    isNative,
  ]);

  const isSaved = question.isSaved();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;

  return (
    <>
      <ViewSection
        className={cx(ViewTitleHeaderS.ViewHeaderContainer, className, {
          [ViewTitleHeaderS.isNavBarOpen]: isNavBarOpen,
        })}
        style={style}
        data-testid="qb-header"
      >
        <Flex className={ViewTitleHeaderS.ViewHeaderLeftSideWrapper}>
          <QueryBuilderBackButton mr="sm" />
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
              isSummarized={isSummarized}
              isNative={isNative}
              originalQuestion={originalQuestion}
              onOpenModal={onOpenModal}
            />
          )}
        </Flex>
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
          editSummary={editSummary}
          onCloseSummary={onCloseSummary}
          setQueryBuilderMode={setQueryBuilderMode}
          toggleBookmark={toggleBookmark}
          onOpenQuestionInfo={onOpenQuestionInfo}
          onCloseQuestionInfo={onCloseQuestionInfo}
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          isObjectDetail={isObjectDetail}
          isSaved={isSaved}
          isModelOrMetric={isModelOrMetric}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={hideFilters}
          onAddFilter={addDraftFilter}
        />
      </ViewSection>

      {KeyboardFilterRow.shouldRender({
        question,
        queryBuilderMode,
      }) && (
        <KeyboardFilterRow
          expanded={areFiltersExpanded}
          question={question}
          isDirty={isDirty}
          draftKey={draftFilterKey}
          onAddDraft={addDraftFilter}
          onRemoveDraft={removeDraftFilter}
          updateQuestion={updateQuestion}
        />
      )}
    </>
  );
}
