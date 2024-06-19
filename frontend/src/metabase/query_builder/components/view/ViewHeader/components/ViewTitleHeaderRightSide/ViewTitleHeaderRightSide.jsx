import cx from "classnames";
import PropTypes from "prop-types";
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
  FilterHeaderToggle,
  QuestionActions,
  QuestionNotebookButton,
  QuestionSummarizeWidget,
  ToggleNativeQueryPreview,
} from "metabase/query_builder/components/view/ViewHeader/components";
import { canExploreResults } from "metabase/query_builder/components/view/ViewHeader/utils";
import * as Lib from "metabase-lib";

ViewTitleHeaderRightSide.propTypes = {
  question: PropTypes.object.isRequired,
  result: PropTypes.object,
  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  isModelOrMetric: PropTypes.bool,
  isSaved: PropTypes.bool,
  isNative: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isDirty: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isActionListVisible: PropTypes.bool,
  runQuestionQuery: PropTypes.func,
  updateQuestion: PropTypes.func.isRequired,
  cancelQuery: PropTypes.func,
  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  setQueryBuilderMode: PropTypes.func,
  turnDatasetIntoQuestion: PropTypes.func,
  areFiltersExpanded: PropTypes.bool,
  onExpandFilters: PropTypes.func,
  onCollapseFilters: PropTypes.func,
  isBookmarked: PropTypes.bool,
  toggleBookmark: PropTypes.func,
  onOpenQuestionInfo: PropTypes.func,
  onCloseQuestionInfo: PropTypes.func,
  isShowingQuestionInfoSidebar: PropTypes.bool,
  onModelPersistenceChange: PropTypes.func,
  onQueryChange: PropTypes.func,
};

export function ViewTitleHeaderRightSide(props) {
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
    !!isDirty &&
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
      {FilterHeaderToggle.shouldRender(props) && (
        <FilterHeaderToggle
          className={cx(CS.ml2, CS.mr1)}
          query={question.query()}
          isExpanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      )}
      {FilterHeaderButton.shouldRender(props) && (
        <FilterHeaderButton
          className={cx(CS.hide, CS.smShow)}
          onOpenModal={onOpenModal}
        />
      )}
      {QuestionSummarizeWidget.shouldRender(props) && (
        <QuestionSummarizeWidget
          className={cx(CS.hide, CS.smShow)}
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
        />
      )}
      {QuestionNotebookButton.shouldRender(props) && (
        <ViewHeaderIconButtonContainer>
          <QuestionNotebookButton
            iconSize={16}
            question={question}
            isShowingNotebook={isShowingNotebook}
            setQueryBuilderMode={setQueryBuilderMode}
          />
        </ViewHeaderIconButtonContainer>
      )}
      {ToggleNativeQueryPreview.shouldRender(props) && (
        <ToggleNativeQueryPreview question={question} />
      )}
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

function getDisabledSaveTooltip(isEditable) {
  if (!isEditable) {
    return t`You don't have permission to save this question.`;
  }
}
