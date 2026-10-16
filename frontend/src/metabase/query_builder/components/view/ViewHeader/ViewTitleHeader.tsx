import cx from "classnames";
import type React from "react";

import type {
  DatasetEditorTab,
  QueryBuilderMode,
  QueryModalType,
} from "metabase/redux/store";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { useSelectedXrayChart } from "../TableFlow/use-xray-selection";
import { getGalleryTableId } from "../TableFlow/utils";
import { ViewSection } from "../ViewSection";

import ViewTitleHeaderS from "./ViewTitleHeader.module.css";
import {
  AdHocQuestionLeftSide,
  QueryBuilderBackButton,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
} from "./components";
import { XrayQuestionLeftSide } from "./components/XrayQuestionLeftSide";

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
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
  isShowingQuestionInfoSidebar: boolean;
  onCloseQuestionInfo: () => void;
  isGalleryOpen?: boolean;
  onToggleGallery?: () => void;

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
  isBookmarked,
  toggleBookmark,
  isRunnable,
  isRunning,
  isNativeEditorOpen,
  isDirty,
  isResultDirty,
  isActionListVisible,
  runQuestionQuery,
  cancelQuery,
  setQueryBuilderMode,
  isShowingQuestionInfoSidebar,
  onCloseQuestionInfo,
  isGalleryOpen,
  onToggleGallery,
  className,
  style,
}: ViewTitleHeaderProps): React.JSX.Element {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  const isSaved = question.isSaved();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;
  const { selectedCard: xrayCard, isSelectedCardEdited: isXrayCardEdited } =
    useSelectedXrayChart(getGalleryTableId(question), false);
  const isShowingXrayChart = xrayCard != null && queryBuilderMode === "view";

  return (
    <ViewSection
      className={cx(ViewTitleHeaderS.ViewHeaderContainer, className, {
        [ViewTitleHeaderS.isNavBarOpen]: isNavBarOpen,
      })}
      style={style}
      data-testid="qb-header"
    >
      <Flex className={ViewTitleHeaderS.ViewHeaderLeftSideWrapper}>
        <QueryBuilderBackButton mr="sm" />
        {isShowingXrayChart ? (
          <XrayQuestionLeftSide card={xrayCard} isEdited={isXrayCardEdited} />
        ) : isSaved ? (
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
        isGalleryOpen={isGalleryOpen}
        onToggleGallery={onToggleGallery}
        isDirty={isDirty}
        isResultDirty={isResultDirty}
        isActionListVisible={isActionListVisible}
        runQuestionQuery={runQuestionQuery}
        cancelQuery={cancelQuery}
        onOpenModal={onOpenModal}
        setQueryBuilderMode={setQueryBuilderMode}
        toggleBookmark={toggleBookmark}
        onOpenQuestionInfo={onOpenQuestionInfo}
        onCloseQuestionInfo={onCloseQuestionInfo}
        isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
        isSaved={isSaved}
        isModelOrMetric={isModelOrMetric}
      />
    </ViewSection>
  );
}
