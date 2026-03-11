import cx from "classnames";
import type React from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { QuestionSharingMenu } from "metabase/embedding/components/SharingMenu";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import { RunButtonWithTooltip } from "metabase/query_builder/components/RunButtonWithTooltip";
import { canExploreResults } from "metabase/query_builder/components/view/ViewHeader/utils";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getUserCanWriteToCollections } from "metabase/selectors/user";
import { Box, Button, Flex, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import { ExploreResultsLink } from "../ExploreResultsLink";
import { FilterHeaderButton } from "../FilterHeaderButton";
import { QuestionActions } from "../QuestionActions";
import { QuestionNotebookButton } from "../QuestionNotebookButton";
import { QuestionSummarizeWidget } from "../QuestionSummarizeWidget";
import { ToggleNativeQueryPreview } from "../ToggleNativeQueryPreview";

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
  areFiltersExpanded: boolean;
  onExpandFilters: () => void;
  onCollapseFilters: () => void;
  toggleBookmark: () => void;
  onOpenQuestionInfo: () => void;
  onCloseQuestionInfo: () => void;
  isShowingQuestionInfoSidebar: boolean;
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
  areFiltersExpanded,
  onExpandFilters,
  onCollapseFilters,
  toggleBookmark,
  onOpenQuestionInfo,
  onCloseQuestionInfo,
  isShowingQuestionInfoSidebar,
  isObjectDetail,
}: ViewTitleHeaderRightSideProps): React.JSX.Element {
  const isShowingNotebook = queryBuilderMode === "notebook";
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

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
    isActionListVisible &&
    canWriteToCollections;

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

  const cacheStrategyType = result?.json_query?.["cache-strategy"]?.type;
  const getRunButtonLabel = useCallback(() => {
    if (isRunning) {
      return t`Cancel`;
    }
    if ([undefined, "nocache"].includes(cacheStrategyType)) {
      return `Refresh`;
    }
    return t`Clear cache and refresh`;
  }, [isRunning, cacheStrategyType]);

  const canSave = Lib.canSave(question.query(), question.type());
  const isSaveDisabled = !canSave;
  const isBrandNew = !isSaved && !result && queryBuilderMode === "notebook";
  const saveTooltip = getSaveTooltip(question);

  useRegisterShortcut(
    hasRunButton && !isShowingNotebook
      ? [
          {
            id: "query-builder-data-refresh",
            perform: () =>
              isRunning ? cancelQuery : runQuestionQuery({ ignoreCache: true }),
          },
        ]
      : [],
    [isRunning, isShowingNotebook, hasRunButton],
  );

  return (
    <Flex
      className={ViewTitleHeaderS.ViewHeaderActionPanel}
      data-testid="qb-header-action-panel"
    >
      {FilterHeaderButton.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
        isActionListVisible,
      }) && (
        <FilterHeaderButton
          question={question}
          isExpanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      )}
      {QuestionSummarizeWidget.shouldRender({
        question,
        queryBuilderMode,
        isObjectDetail,
        isActionListVisible,
      }) && (
        <QuestionSummarizeWidget
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
      <Box className={ViewTitleHeaderS.Divider} />
      {ToggleNativeQueryPreview.shouldRender({
        question,
        queryBuilderMode,
      }) && <ToggleNativeQueryPreview question={question} />}
      {hasExploreResultsLink && <ExploreResultsLink question={question} />}
      {hasRunButton && !isShowingNotebook && (
        <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
          <RunButtonWithTooltip
            className={cx(
              ViewTitleHeaderS.ViewHeaderIconButton,
              ViewTitleHeaderS.ViewRunButtonWithTooltip,
              {
                [ViewTitleHeaderS.isDirty]: isResultDirty,
              },
            )}
            iconSize={16}
            onlyIcon
            medium
            isRunning={isRunning}
            isDirty={isResultDirty}
            onRun={() => runQuestionQuery({ ignoreCache: true })}
            onCancel={cancelQuery}
            getTooltip={getRunButtonLabel}
          />
        </Box>
      )}
      {!isShowingNotebook && (hasSaveButton || isSaved) && (
        <QuestionSharingMenu question={question} />
      )}
      {!isShowingNotebook &&
      PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question) ? (
        <PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisButton />
      ) : null}
      {isSaved && (
        <QuestionActions
          question={question}
          isBookmarked={isBookmarked}
          isShowingQuestionInfoSidebar={isShowingQuestionInfoSidebar}
          onOpenModal={onOpenModal}
          onToggleBookmark={toggleBookmark}
          onSetQueryBuilderMode={setQueryBuilderMode}
          onInfoClick={handleInfoClick}
        />
      )}
      {hasSaveButton && (
        <Tooltip disabled={!saveTooltip} label={saveTooltip} position="left">
          <Button
            className={ViewTitleHeaderS.SaveButton}
            data-testid="qb-save-button"
            px="md"
            py="sm"
            variant="subtle"
            aria-disabled={isSaveDisabled || undefined}
            data-disabled={isSaveDisabled || undefined}
            onClick={(event) => {
              event.preventDefault();
              if (!isSaveDisabled) {
                onOpenModal(MODAL_TYPES.SAVE);
              }
            }}
          >
            {t`Save`}
          </Button>
        </Tooltip>
      )}
    </Flex>
  );
}

function getSaveTooltip(question: Question) {
  const query = question.query();
  const { isEditable } = Lib.queryDisplayInfo(query);
  if (!isEditable) {
    return t`You don't have permission to save this question.`;
  }

  const errors = Lib.validateTemplateTags(query);
  return errors[0]?.message;
}
