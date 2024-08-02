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
} from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
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
import type { QueryModalType } from "metabase/query_builder/constants";
import { Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

interface ViewTitleHeaderRightSideProps {
  question: Question;
  result: Dataset;
  queryBuilderMode: QueryBuilderMode;
  isBookmarked: boolean;
  isModelOrMetric: boolean;
  isSaved: boolean;
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
  onEditSummary: () => void;
  onCloseSummary: () => void;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
  turnModelIntoQuestion: () => void;
  areFiltersExpanded: boolean;
  onExpandFilters: () => void;
  onCollapseFilters: () => void;
  toggleBookmark: () => void;
  onOpenQuestionInfo: () => void;
  onCloseQuestionInfo: () => void;
  isShowingQuestionInfoSidebar: boolean;
  onModelPersistenceChange: () => void;
  isObjectDetail: boolean;
}

export function ViewTitleHeaderRightSide({
  question,
  result,
  queryBuilderMode,
  isBookmarked,
  isModelOrMetric,
  isSaved,
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
  turnModelIntoQuestion,
  areFiltersExpanded,
  onExpandFilters,
  onCollapseFilters,
  toggleBookmark,
  onOpenQuestionInfo,
  onCloseQuestionInfo,
  isShowingQuestionInfoSidebar,
  onModelPersistenceChange,
  isObjectDetail,
}: ViewTitleHeaderRightSideProps): React.JSX.Element {
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
  const isBrandNew = !isSaved && !result && queryBuilderMode === "notebook";
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
        isBrandNew,
      }) && (
        <QuestionNotebookButton
          isShowingNotebook={isShowingNotebook}
          setQueryBuilderMode={setQueryBuilderMode}
        />
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
          question={question}
          isBookmarked={isBookmarked}
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          onOpenModal={onOpenModal}
          onToggleBookmark={toggleBookmark}
          onSetQueryBuilderMode={setQueryBuilderMode}
          onTurnModelIntoQuestion={turnModelIntoQuestion}
          onInfoClick={handleInfoClick}
          onModelPersistenceChange={onModelPersistenceChange}
        />
      )}
      {hasSaveButton && (
        <Tooltip label={disabledSaveTooltip} disabled={canSave} position="left">
          <SaveButton
            data-testid="qb-save-button"
            px="md"
            py="sm"
            variant="subtle"
            aria-disabled={isSaveDisabled || undefined}
            data-disabled={isSaveDisabled || undefined}
            onClick={event => {
              event.preventDefault();
              if (!isSaveDisabled) {
                onOpenModal("save");
              }
            }}
          >
            {t`Save`}
          </SaveButton>
        </Tooltip>
      )}
    </ViewHeaderActionPanel>
  );
}

function getDisabledSaveTooltip(isEditable: boolean) {
  if (!isEditable) {
    return t`You don't have permission to save this question.`;
  }
}
