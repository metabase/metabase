import cx from "classnames";
import type React from "react";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/common/hooks/use-toggle";
import { NavOpenButton } from "metabase/nav/prototype/NavOpenButton";
import { useNavToggleAlignedPadding } from "metabase/nav/prototype/use-nav-toggle-inset";
import {
  isModernNav,
  useNavVariant,
} from "metabase/nav/prototype/use-nav-variant";
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
  QueryBuilderBackButton,
  QuestionFiltersHeader,
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

  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;

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
  // PROTOTYPE: in "No top nav", this row sits beside the nav's header, so it
  // matches that header's height to line their contents up.
  const { variant } = useNavVariant();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;
  // PROTOTYPE: in "Modern nav - C" with the nav closed, a saved question's
  // header lines up with the open-sidebar button's icon in the bar above —
  // measured, since the title sits inside several offset wrappers. With a
  // back-to-dashboard button, its arrow lines up instead, the title after it.
  const headerRef = useRef<HTMLDivElement>(null);
  const navToggleAlignedPadding = useNavToggleAlignedPadding(headerRef, [
    { selector: '[data-testid="qb-back-button"] svg', kind: "icon" },
    { selector: '[data-testid="saved-question-header-title"]', kind: "text" },
  ]);
  const alignedInset = isSaved ? navToggleAlignedPadding : undefined;

  return (
    <>
      <ViewSection
        className={cx(ViewTitleHeaderS.ViewHeaderContainer, className, {
          [ViewTitleHeaderS.isNavBarOpen]: isNavBarOpen,
          [ViewTitleHeaderS.alignWithNavHeader]: isModernNav(variant),
          [ViewTitleHeaderS.underBreadcrumbBar]:
            variant === "modern-nav-c" && isSaved,
        })}
        style={style}
        data-testid="qb-header"
        ref={headerRef}
        pl={alignedInset}
      >
        <Flex className={ViewTitleHeaderS.ViewHeaderLeftSideWrapper}>
          {/* PROTOTYPE: "No top nav" opens the closed nav from here. */}
          <NavOpenButton />
          <QueryBuilderBackButton mr="sm" data-testid="qb-back-button" />
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
          onCollapseFilters={collapseFilters}
        />
      </ViewSection>

      {QuestionFiltersHeader.shouldRender({
        question,
        queryBuilderMode,
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
