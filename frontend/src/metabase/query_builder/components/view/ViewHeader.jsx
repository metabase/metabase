import React, { useEffect, useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import { usePrevious, useMount } from "react-use";

import * as Urls from "metabase/lib/urls";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";
import { useToggle } from "metabase/hooks/use-toggle";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";

import ViewButton from "metabase/query_builder/components/view/ViewButton";
import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";

import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getDashboard } from "metabase/query_builder/selectors";
import RunButtonWithTooltip from "../RunButtonWithTooltip";
import QuestionActions from "../QuestionActions";
import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionNotebookButton from "./QuestionNotebookButton";
import ConvertQueryButton from "./ConvertQueryButton";
import QuestionFilters, {
  FilterHeaderToggle,
  FilterHeader,
  QuestionFilterWidget,
} from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";
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
  BackButton,
  BackButtonContainer,
} from "./ViewHeader.styled";

const viewTitleHeaderPropTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,

  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  setQueryBuilderMode: PropTypes.func,

  result: PropTypes.object,

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
  const { question, className, style, isNavBarOpen, updateQuestion } = props;

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
        <DashboardBackButton />
        {isSaved ? (
          <SavedQuestionLeftSide {...props} />
        ) : (
          <AhHocQuestionLeftSide
            {...props}
            isNative={isNative}
            isSummarized={isSummarized}
          />
        )}
        <ViewTitleHeaderRightSide
          {...props}
          isSaved={isSaved}
          isDataset={isDataset}
          isNative={isNative}
          isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
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

function DashboardBackButton() {
  const dashboard = useSelector(getDashboard);
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(navigateBackToDashboard(dashboard.id));
  };

  if (!dashboard) {
    return null;
  }

  const label = t`Back to ${dashboard.name}`;

  return (
    <Tooltip tooltip={label}>
      <BackButtonContainer>
        <BackButton
          as={Link}
          to={Urls.dashboard(dashboard)}
          round
          icon="arrow_left"
          aria-label={label}
          onClick={handleClick}
        />
      </BackButtonContainer>
    </Tooltip>
  );
}

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  onOpenQuestionInfo: PropTypes.func.isRequired,
  onSave: PropTypes.func,
};

function SavedQuestionLeftSide(props) {
  const {
    question,
    isObjectDetail,
    isAdditionalInfoVisible,
    onOpenQuestionInfo,
    onSave,
  } = props;

  const [showSubHeader, setShowSubHeader] = useState(true);

  useMount(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  });

  const hasLastEditInfo = question.lastEditInfo() != null;
  const isDataset = question.isDataset();

  const onHeaderChange = useCallback(
    name => {
      if (name && name !== question.displayName()) {
        onSave(question.setDisplayName(name));
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
            parts={[
              ...(isAdditionalInfoVisible && isDataset
                ? [
                    <DatasetCollectionBadge
                      key="collection"
                      dataset={question}
                    />,
                  ]
                : []),

              <SavedQuestionHeaderButton
                key={question.displayName()}
                question={question}
                onSave={onHeaderChange}
              />,
            ]}
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
  originalQuestion: PropTypes.object,
  isNative: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isSummarized: PropTypes.bool,
  onOpenModal: PropTypes.func,
};

function AhHocQuestionLeftSide(props) {
  const {
    question,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
    onOpenModal,
  } = props;

  const handleTitleClick = () => {
    const query = question.query();
    if (!query.readOnly()) {
      onOpenModal(MODAL_TYPES.SAVE);
    }
  };

  return (
    <AdHocLeftSideRoot>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading color="medium">
          {isNative ? (
            t`New question`
          ) : (
            <QuestionDescription
              question={question}
              originalQuestion={originalQuestion}
              isObjectDetail={isObjectDetail}
              onClick={handleTitleClick}
            />
          )}
        </AdHocViewHeading>
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

function ViewTitleHeaderRightSide(props) {
  const {
    question,
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
    onQueryChange,
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
      {ConvertQueryButton.shouldRender(props) && (
        <ConvertQueryButton question={question} onOpenModal={onOpenModal} />
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
          onClick={() => onOpenModal("save")}
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
