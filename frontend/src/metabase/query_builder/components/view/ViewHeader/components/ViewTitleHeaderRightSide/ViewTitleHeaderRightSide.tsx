import cx from "classnames";
import type React from "react";
import { useCallback } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";
import {
  SaveButton,
  ViewHeaderActionPanel,
  ViewHeaderIconButtonContainer,
  ViewRunButtonWithTooltip,
} from "metabase/query_builder/components/view/ViewHeader/ViewHeader.styled";
import {
  ExploreResultsLink,
  FilterHeaderButton,
  QuestionFiltersHeaderToggle,
  QuestionActions,
  QuestionNotebookButton,
  QuestionSummarizeWidget,
  ToggleNativeQueryPreview,
} from "metabase/query_builder/components/view/ViewHeader/components";
import { canExploreResults } from "metabase/query_builder/components/view/ViewHeader/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

interface ViewTitleHeaderRightSideProps {
  question: Question;
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
  runQuestionQuery: (parameters: { ignoreCache: boolean }) => void;
  cancelQuery: () => void;
  onOpenModal: (modalType: string) => void;
  onEditSummary: () => void;
  onCloseSummary: () => void;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opt: { datasetEditorTab: DatasetEditorTab },
  ) => void;
  turnDatasetIntoQuestion: () => void;
  areFiltersExpanded: boolean;
  onExpandFilters: () => void;
  onCollapseFilters: () => void;
  isShowingQuestionInfoSidebar: boolean;
  onCloseQuestionInfo: () => void;
  onOpenQuestionInfo: () => void;
  onModelPersistenceChange: () => void;
  isObjectDetail: boolean;
}

export function ViewTitleHeaderRightSide(
  props: ViewTitleHeaderRightSideProps,
): React.JSX.Element {
  const {
    question,
    result,
    queryBuilderMode,
    isBookmarked,
    toggleBookmark,
    isSaved,
    isModelOrMetric,
    isRunnable,
    isRunning,
    isNativeEditorOpen,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    isActionListVisible,
    runQuestionQuery,
    cancelQuery,
    onOpenModal,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
    turnDatasetIntoQuestion,
    areFiltersExpanded,
    onExpandFilters,
    onCollapseFilters,
    isShowingQuestionInfoSidebar,
    onCloseQuestionInfo,
    onOpenQuestionInfo,
    onModelPersistenceChange,
    isObjectDetail,
  } = props;
  const isShowingNotebook = queryBuilderMode === "notebook";
  const { isEditable } = Lib.queryDisplayInfo(question.query());

  const hasExploreResultsLink =
    canExploreResults(question) &&
    MetabaseSettings.get("enable-nested-queries");

  // Models and metrics can't be saved. But changing anything about the model/metric will prompt the user
  // to save it as a new question (based on that model/metric). In other words, at this point
  // the `type` field is set to "question".
  const hasSaveButton =
    !isModelOrMetric &&
    isDirty &&
    !question.isArchived() &&
    isActionListVisible;
  const isMissingPermissions =
    result?.error_type === SERVER_ERROR_TYPES.missingPermissions;
  const hasRunButton =
    isRunnable && !isNativeEditorOpen && !isMissingPermissions;

  const handleInfoClick = useCallback(() => {
    if (isShowingQuestionInfoSidebar) {
      onCloseQuestionInfo();
    } else {
      onOpenQuestionInfo();
    }
  }, [isShowingQuestionInfoSidebar, onOpenQuestionInfo, onCloseQuestionInfo]);

  const getRunButtonLabel = useCallback(
    () => (isRunning ? t`Cancel` : t`Refresh`),
    [isRunning],
  );

  const canSave = Lib.canSave(question.query(), question.type());
  const isSaveDisabled = !canSave;
  const disabledSaveTooltip = getDisabledSaveTooltip(isEditable);

  return (
    <ViewHeaderActionPanel data-testid="qb-header-action-panel">
      {QuestionFiltersHeaderToggle.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
      }) && (
        <QuestionFiltersHeaderToggle
          className={cx(CS.ml2, CS.mr1)}
          query={question.query()}
          isExpanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      )}

      {FilterHeaderButton.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
        isActionListVisible,
      }) && (
        <FilterHeaderButton
          className={cx(CS.hide, CS.smShow)}
          onOpenModal={onOpenModal}
        />
      )}

      {QuestionSummarizeWidget.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
        isActionListVisible,
      }) && (
        <QuestionSummarizeWidget
          className={cx(CS.hide, CS.smShow)}
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
        />
      )}

      {QuestionNotebookButton.shouldRender({
        question,
        isActionListVisible,
      }) && (
        <ViewHeaderIconButtonContainer>
          <QuestionNotebookButton
            iconSize={16}
            question={question}
            isShowingNotebook={isShowingNotebook}
            setQueryBuilderMode={setQueryBuilderMode}
          />
        </ViewHeaderIconButtonContainer>
      )}

      {ToggleNativeQueryPreview.shouldRender({
        question,
        queryBuilderMode,
      }) && <ToggleNativeQueryPreview question={question} />}

      {hasExploreResultsLink && <ExploreResultsLink question={question} />}

      {hasRunButton && !isShowingNotebook && (
        <ViewHeaderIconButtonContainer>
          <ViewRunButtonWithTooltip
            iconSize={16}
            onlyIcon
            medium
            compact
            result={result}
            isRunning={isRunning}
            isDirty={isResultDirty}
            onRun={() => runQuestionQuery({ ignoreCache: true })}
            onCancel={cancelQuery}
            getTooltip={getRunButtonLabel}
          />
        </ViewHeaderIconButtonContainer>
      )}

      {isSaved && (
        <QuestionActions
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          isBookmarked={isBookmarked}
          handleBookmark={toggleBookmark}
          onOpenModal={onOpenModal}
          question={question}
          setQueryBuilderMode={setQueryBuilderMode}
          turnDatasetIntoQuestion={turnDatasetIntoQuestion}
          onInfoClick={handleInfoClick}
          onModelPersistenceChange={onModelPersistenceChange}
        />
      )}

      {hasSaveButton && (
        <SaveButton
          role="button"
          to=""
          disabled={isSaveDisabled}
          tooltip={{
            tooltip: disabledSaveTooltip,
            isEnabled: isSaveDisabled,
            placement: "left",
          }}
          onClick={() => onOpenModal("save")}
        >
          {t`Save`}
        </SaveButton>
      )}
    </ViewHeaderActionPanel>
  );
}

function getDisabledSaveTooltip(isEditable: boolean) {
  if (!isEditable) {
    return t`You don't have permission to save this question.`;
  }
}
