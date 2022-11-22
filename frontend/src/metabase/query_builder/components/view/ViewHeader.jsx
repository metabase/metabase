import React, { useEffect, useCallback, useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import * as Urls from "metabase/lib/urls";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import Link from "metabase/core/components/Link";
import ViewButton from "metabase/query_builder/components/view/ViewButton";

import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { MODAL_TYPES } from "metabase/query_builder/constants";
import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";

import RunButtonWithTooltip from "../RunButtonWithTooltip";

import QuestionActions from "../QuestionActions";
import DataAppBackButton from "./DataAppBackButton";
import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionNotebookButton from "./QuestionNotebookButton";
import QuestionFilters, {
  FilterHeaderToggle,
  FilterHeader,
  QuestionFilterWidget,
} from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";
import NativeQueryButton from "./NativeQueryButton";
import {
  AdHocViewHeading,
  SaveButton,
  SavedQuestionHeaderButtonContainer,
  ViewHeaderMainLeftContentContainer,
  ViewHeaderLeftSubHeading,
  ViewHeaderContainer,
  StyledLastEditInfoLabel,
  StyledQuestionDataSource,
  SavedQuestionLeftSideRoot,
  AdHocLeftSideRoot,
  HeaderDivider,
  ViewHeaderActionPanel,
  ViewHeaderIconButtonContainer,
} from "./ViewHeader.styled";

const viewTitleHeaderPropTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,

  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  setQueryBuilderMode: PropTypes.func,

  result: PropTypes.object,

  location: PropTypes.object.isRequired,

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

export function ViewTitleHeader(props) {
  const { question, location, className, style, isNavBarOpen, updateQuestion } =
    props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  useEffect(() => {
    if (!question.isStructured() || !previousQuestion?.isStructured()) {
      return;
    }

    const filtersCount = question.query().filters().length;
    const previousFiltersCount = previousQuestion.query().filters().length;

    if (filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters]);

  const isStructured = question.isStructured();
  const isNative = question.isNative();
  const isSaved = question.isSaved();
  const isDataset = question.isDataset();

  const isSummarized =
    isStructured && question.query().topLevelQuery().hasAggregations();

  const fromUrl = location.query["from"];
  const hasValidFromUrl =
    // At the moment, only data app paths are expected
    typeof fromUrl === "string" && Urls.isDataAppPath(fromUrl);

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
        {isSaved ? (
          <SavedQuestionLeftSide
            {...props}
            fromUrl={hasValidFromUrl ? fromUrl : null}
          />
        ) : (
          <AhHocQuestionLeftSide
            {...props}
            isNative={isNative}
            isSummarized={isSummarized}
            fromUrl={hasValidFromUrl ? fromUrl : null}
          />
        )}
        <ViewTitleHeaderRightSide
          {...props}
          isSaved={isSaved}
          isDataset={isDataset}
          isNative={isNative}
          isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
          fromUrl={hasValidFromUrl ? fromUrl : null}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
          onQueryChange={onQueryChange}
        />
      </ViewHeaderContainer>
      {QuestionFilters.shouldRender(props) && (
        <FilterHeader
          {...props}
          expanded={areFiltersExpanded}
          question={question}
          onQueryChange={onQueryChange}
        />
      )}
    </>
  );
}

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  fromUrl: PropTypes.string,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  onOpenQuestionInfo: PropTypes.func.isRequired,
  onSave: PropTypes.func,
};

function SavedQuestionLeftSide(props) {
  const {
    question,
    fromUrl,
    isObjectDetail,
    isAdditionalInfoVisible,
    onOpenQuestionInfo,
    onSave,
  } = props;

  const [showSubHeader, setShowSubHeader] = useState(true);

  const hasLastEditInfo = question.lastEditInfo() != null;
  const isDataset = question.isDataset();

  useOnMount(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  });

  const breadcrumbs = useMemo(() => {
    const list = [];
    if (fromUrl) {
      list.push(<DataAppBackButton key="back-to-data-app" url={fromUrl} />);
    } else if (isAdditionalInfoVisible && question.isDataset()) {
      list.push(<DatasetCollectionBadge key="collection" dataset={question} />);
    }
    list.push(
      <SavedQuestionHeaderButton
        key="question-name"
        question={question}
        onSave={onHeaderChange}
      />,
    );
    return list;
  }, [question, fromUrl, isAdditionalInfoVisible, onHeaderChange]);

  const onHeaderChange = useCallback(
    name => {
      if (name && name !== question.displayName()) {
        onSave(question.setDisplayName(name).card());
      }
    },
    [question, onSave],
  );

  return (
    <SavedQuestionLeftSideRoot
      data-testid="qb-header-left-side"
      showSubHeader={showSubHeader}
    >
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer isDataset={isDataset}>
          <HeadBreadcrumbs
            divider={<HeaderDivider>/</HeaderDivider>}
            parts={breadcrumbs}
          />
        </SavedQuestionHeaderButtonContainer>
      </ViewHeaderMainLeftContentContainer>
      {isAdditionalInfoVisible && (
        <ViewHeaderLeftSubHeading>
          {QuestionDataSource.shouldRender(props) && !isDataset && (
            <StyledQuestionDataSource
              question={question}
              isObjectDetail={isObjectDetail}
              subHead
            />
          )}
          {hasLastEditInfo && isAdditionalInfoVisible && (
            <StyledLastEditInfoLabel
              item={question.card()}
              onClick={onOpenQuestionInfo}
            />
          )}
        </ViewHeaderLeftSubHeading>
      )}
    </SavedQuestionLeftSideRoot>
  );
}

AhHocQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  fromUrl: PropTypes.string,
  originalQuestion: PropTypes.object,
  isNative: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isSummarized: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

function AhHocQuestionLeftSide(props) {
  const {
    question,
    fromUrl,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
    onOpenModal,
  } = props;

  const handleTitleClick = useCallback(() => {
    const query = question.query();
    if (!query.readOnly()) {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  }, [question, onOpenModal]);

  const renderTitle = useCallback(() => {
    if (isNative) {
      return t`New question`;
    }
    if (fromUrl) {
      return (
        <HeadBreadcrumbs
          divider={<HeaderDivider>/</HeaderDivider>}
          parts={[
            <DataAppBackButton key="back-to-data-app" url={fromUrl} />,
            <SavedQuestionHeaderButton
              key="question-name"
              question={originalQuestion}
              isRenamingDisabled
            />,
          ]}
        />
      );
    }
    return (
      <QuestionDescription
        question={question}
        originalQuestion={originalQuestion}
        isObjectDetail={isObjectDetail}
        onClick={handleTitleClick}
        fromUrl={fromUrl}
      />
    );
  }, [
    question,
    originalQuestion,
    isObjectDetail,
    fromUrl,
    isNative,
    handleTitleClick,
  ]);

  return (
    <AdHocLeftSideRoot>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading color="medium">{renderTitle()}</AdHocViewHeading>
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        {isSummarized && (
          <QuestionDataSource
            className="mb1"
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
            data-metabase-event="Question Data Source Click"
          />
        )}
      </ViewHeaderLeftSubHeading>
    </AdHocLeftSideRoot>
  );
}

DatasetCollectionBadge.propTypes = {
  dataset: PropTypes.object.isRequired,
};

function DatasetCollectionBadge({ dataset }) {
  const { collection } = dataset.card();
  return (
    <HeadBreadcrumbs.Badge to={Urls.collection(collection)} icon="model">
      {collection?.name || t`Our analytics`}
    </HeadBreadcrumbs.Badge>
  );
}

ViewTitleHeaderRightSide.propTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,
  result: PropTypes.object,
  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  isDataset: PropTypes.bool,
  isSaved: PropTypes.bool,
  isNative: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isDirty: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isActionListVisible: PropTypes.bool,
  fromUrl: PropTypes.string,
  runQuestionQuery: PropTypes.func,
  updateQuestion: PropTypes.func.isRequired,
  cancelQuery: PropTypes.func,
  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  setQueryBuilderMode: PropTypes.func,
  turnQuestionIntoAction: PropTypes.func,
  turnActionIntoQuestion: PropTypes.func,
  turnDatasetIntoQuestion: PropTypes.func,
  areFiltersExpanded: PropTypes.bool,
  onExpandFilters: PropTypes.func,
  onCollapseFilters: PropTypes.func,
  isBookmarked: PropTypes.bool,
  toggleBookmark: PropTypes.func,
  onOpenQuestionInfo: PropTypes.func,
  onCloseQuestionInfo: PropTypes.func,
  isShowingQuestionInfoSidebar: PropTypes.bool,
  onModelPersistenceChange: PropTypes.bool,
  onQueryChange: PropTypes.func,
  onSave: PropTypes.func.isRequired,
};

function ViewTitleHeaderRightSide(props) {
  const {
    question,
    originalQuestion,
    result,
    queryBuilderMode,
    isBookmarked,
    toggleBookmark,
    isSaved,
    isDataset,
    isNative,
    isRunnable,
    isRunning,
    isNativeEditorOpen,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    isActionListVisible,
    fromUrl,
    runQuestionQuery,
    updateQuestion,
    cancelQuery,
    onOpenModal,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
    turnDatasetIntoQuestion,
    turnQuestionIntoAction,
    turnActionIntoQuestion,
    areFiltersExpanded,
    onExpandFilters,
    onCollapseFilters,
    isShowingQuestionInfoSidebar,
    onCloseQuestionInfo,
    onOpenQuestionInfo,
    onModelPersistenceChange,
    onQueryChange,
    onSave,
  } = props;
  const isShowingNotebook = queryBuilderMode === "notebook";
  const query = question.query();
  const isReadOnlyQuery = query.readOnly();
  const canEditQuery = !isReadOnlyQuery;
  const canRunAdhocQueries = !isReadOnlyQuery;
  const canNest = query.canNest();
  const hasExploreResultsLink =
    isNative &&
    canNest &&
    isSaved &&
    canRunAdhocQueries &&
    MetabaseSettings.get("enable-nested-queries");

  const isNewQuery = !query.hasData();
  const hasSaveButton =
    !isDataset &&
    !!isDirty &&
    (isNewQuery || canEditQuery) &&
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

  const handleSaveClick = useCallback(() => {
    const canOverwrite = question.isDirty() && originalQuestion;
    // Will overwrite without the question without prompting
    // and immediately go to `fromUrl`
    if (canOverwrite && fromUrl) {
      onSave({ ...question.card(), id: originalQuestion.id() });
    } else {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  }, [question, originalQuestion, fromUrl, onSave, onOpenModal]);

  return (
    <ViewHeaderActionPanel data-testid="qb-header-action-panel">
      {QuestionFilters.shouldRender(props) && (
        <FilterHeaderToggle
          className="ml2 mr1"
          question={question}
          expanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
          onQueryChange={onQueryChange}
        />
      )}
      {QuestionFilterWidget.shouldRender(props) && (
        <QuestionFilterWidget
          className="hide sm-show"
          onOpenModal={onOpenModal}
        />
      )}
      {QuestionSummarizeWidget.shouldRender(props) && (
        <QuestionSummarizeWidget
          className="hide sm-show"
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
          data-metabase-event="View Mode; Open Summary Widget"
        />
      )}
      {QuestionNotebookButton.shouldRender(props) && (
        <ViewHeaderIconButtonContainer>
          <QuestionNotebookButton
            iconSize={16}
            question={question}
            isShowingNotebook={isShowingNotebook}
            setQueryBuilderMode={setQueryBuilderMode}
            data-metabase-event={
              isShowingNotebook
                ? `Notebook Mode;Go to View Mode`
                : `View Mode; Go to Notebook Mode`
            }
          />
        </ViewHeaderIconButtonContainer>
      )}
      {NativeQueryButton.shouldRender(props) && (
        <ViewHeaderIconButtonContainer>
          <NativeQueryButton
            size={16}
            question={question}
            updateQuestion={updateQuestion}
            data-metabase-event="Notebook Mode; Convert to SQL Click"
          />
        </ViewHeaderIconButtonContainer>
      )}
      {hasExploreResultsLink && <ExploreResultsLink question={question} />}
      {hasRunButton && !isShowingNotebook && (
        <ViewHeaderIconButtonContainer>
          <RunButtonWithTooltip
            className={cx("text-brand-hover text-dark", {
              "text-white-hover": isResultDirty,
            })}
            iconSize={16}
            onlyIcon
            medium
            compact
            result={result}
            isRunning={isRunning}
            isDirty={isResultDirty}
            onRun={() => runQuestionQuery({ ignoreCache: true })}
            onCancel={cancelQuery}
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
          turnQuestionIntoAction={turnQuestionIntoAction}
          turnActionIntoQuestion={turnActionIntoQuestion}
          onInfoClick={handleInfoClick}
          onModelPersistenceChange={onModelPersistenceChange}
        />
      )}
      {hasSaveButton && (
        <SaveButton
          disabled={!question.canRun() || !canEditQuery}
          tooltip={{
            tooltip: t`You don't have permission to save this question.`,
            isEnabled: !canEditQuery,
            placement: "left",
          }}
          data-metabase-event={
            isShowingNotebook
              ? `Notebook Mode; Click Save`
              : `View Mode; Click Save`
          }
          onClick={handleSaveClick}
        >
          {t`Save`}
        </SaveButton>
      )}
    </ViewHeaderActionPanel>
  );
}

ExploreResultsLink.propTypes = {
  question: PropTypes.object.isRequired,
};

function ExploreResultsLink({ question }) {
  const url = question
    .composeThisQuery()
    .setDisplay("table")
    .setSettings({})
    .getUrl();

  return (
    <Link to={url}>
      <ViewButton medium p={[2, 1]} icon="insight" labelBreakpoint="sm">
        {t`Explore results`}
      </ViewButton>
    </Link>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;
